/**
 * Stages 5-7 of the pipeline (§2), shared by every operator: extract the
 * fields, check they hold together, and score the reading. Each operator
 * parser is this pipeline with its own patterns tried first, plus any
 * layout-specific reader it needs.
 */
import { maskIdentifiersInText } from '../../../../utils/privacy';
import { firstTransactionAmount, parseAmount } from '../amount';
import {
  classifyTransaction,
  detectDirection,
  detectStatus,
  isIncoming,
  operatorEvidence,
  type OperatorEvidence,
} from '../classifier';
import { scoreTzConfidence } from '../confidence';
import { extractTzDateTime, transactionAt } from '../date';
import { COMMON_PATTERNS, type OperatorPatterns } from '../patterns';
import { maskNumber, maskTzPhone, PHONE } from '../phone';
import { extractTransactionId } from '../transaction-id';
import type { NormalizedSmsMessage, SmsParser } from '../types/parser-result';
import type {
  Bank,
  Merchant,
  ParsedTransaction,
  Party,
  TzTransactionType,
} from '../types/transaction';

export const PARSER_VERSION = '1.0.0';

/** Anything larger is not a mobile-money transaction: a misread number. */
const LARGEST_PLAUSIBLE_AMOUNT = 100_000_000;

/** A layout-specific reading of the other side, tried before the patterns. */
export interface LayoutParty {
  party: Party;
  merchant: Merchant | null;
  network: string | null;
}

export interface ParserHooks {
  counterparty?: (text: string) => LayoutParty | null;
  /** A second reference the layout adds ("Risiti"). */
  reference?: (text: string) => string | null;
}

/** The first capture group any pattern finds, as an amount. */
export function firstAmount(text: string, patterns: readonly RegExp[]): number | null {
  for (const pattern of patterns) {
    const m = pattern.exec(text);
    if (!m) continue;
    const value = parseAmount(m.slice(1).find((g) => g !== undefined));
    if (value != null) return value;
  }
  return null;
}

export interface ReadParty {
  name: string | null;
  /** Masked. */
  phone: string | null;
  /** A till, business or account number, masked. */
  number: string | null;
}

/**
 * Split "JOHN MWAKASEGE 0712345678", "556677- MY BANK" or "TIPS-Mixx By Yas,
 * 922749" into a name and a masked number. Placeholders ("………") are no name.
 */
export function readParty(segment: string): ReadParty {
  let s = segment.replace(/\s+/g, ' ').trim();

  const phoneMatch = new RegExp(PHONE).exec(s);
  const phone = phoneMatch ? maskTzPhone(phoneMatch[0]) : null;
  if (phoneMatch) s = s.replace(phoneMatch[0], ' ');

  const numberMatch = /\b\d{4,15}\b/.exec(s);
  const number = numberMatch ? maskNumber(numberMatch[0]) : null;
  if (numberMatch) s = s.replace(numberMatch[0], ' ');

  s = s
    .replace(/\bLIPA\b/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;()\-]+|[\s,.:;()\-]+$/g, '')
    .trim();
  const name = /[A-Za-z]{2,}/.test(s) ? maskIdentifiersInText(s) : null;
  return { name, phone, number };
}

export function firstParty(text: string, patterns: readonly RegExp[]): ReadParty | null {
  for (const pattern of patterns) {
    // A layout may give the number and the name as separate fields.
    const groups =
      pattern
        .exec(text)
        ?.slice(1)
        .filter((g): g is string => g !== undefined) ?? [];
    if (groups.length === 0) continue;
    const party = readParty(groups.join(' '));
    if (party.name || party.phone || party.number) return party;
  }
  return null;
}

/** Kinds paid to a business: the other side's number is a till, not a phone. */
const BUSINESS_KINDS: readonly TzTransactionType[] = [
  'MERCHANT_PAYMENT',
  'BILL_PAYMENT',
  'GOVERNMENT_PAYMENT',
];

const idValue = (raw: string | undefined) => {
  if (!raw) return null;
  return /^\d{7,}$/.test(raw) ? maskNumber(raw) : raw;
};

function readTransaction(
  message: NormalizedSmsMessage,
  patterns: OperatorPatterns,
  hooks: ParserHooks,
  evidence: OperatorEvidence,
): ParsedTransaction {
  const text = message.text;
  const C = COMMON_PATTERNS;

  const amount =
    firstAmount(text, [...patterns.amount, ...C.amount]) ?? firstTransactionAmount(text);
  const balance = firstAmount(text, [...patterns.balance, ...C.balance]);
  const fee = C.noFee.test(text) ? null : firstAmount(text, [...patterns.fee, ...C.fee]);
  const levy = firstAmount(text, C.levy);
  const direction = detectDirection(text);
  const status = detectStatus(text);
  const kind = classifyTransaction({
    text,
    direction,
    hasAmount: amount != null,
    hasBalance: balance != null,
  });
  const type = kind.type;
  const id = extractTransactionId(text, patterns.transactionId);
  const when = extractTzDateTime(text);

  let sender: Party | null = null;
  let recipient: Party | null = null;
  let merchant: Merchant | null = null;
  let bank: Bank | null = null;
  let network = C.network.exec(text)?.[1] ?? null;

  if (type !== 'UNKNOWN' && type !== 'BALANCE_NOTIFICATION') {
    if (isIncoming(type, direction)) {
      const party = firstParty(text, [...patterns.sender, ...C.sender]);
      if (party) sender = { name: party.name, phone: party.phone };
    } else {
      const layout = hooks.counterparty?.(text);
      if (layout) {
        recipient = layout.party;
        merchant = layout.merchant;
        network = layout.network ?? network;
      } else {
        const party = firstParty(text, [...patterns.recipient, ...C.recipient]);
        if (party) {
          recipient = { name: party.name, phone: party.phone };
          if (BUSINESS_KINDS.includes(type) && (party.number || type === 'MERCHANT_PAYMENT')) {
            merchant = { name: party.name, number: party.number };
          }
        }
      }
    }
  }

  if (type === 'BANK_TRANSFER_IN' || type === 'BANK_TRANSFER_OUT') {
    const account = C.bankAccount.exec(text)?.[1];
    const party = sender ?? recipient;
    bank = {
      name: C.bankName.exec(text)?.[1]?.toUpperCase() ?? party?.name ?? null,
      account: account ? maskNumber(account) : null,
    };
  }

  // §53: fields must hold together before the reading is trusted.
  const warnings: string[] = [];
  let problems = 0;
  if (amount != null && (amount <= 0 || amount > LARGEST_PLAUSIBLE_AMOUNT)) {
    problems += 1;
    warnings.push('The amount looks wrong. Check it.');
  }
  if (fee != null && levy != null && levy > fee) {
    problems += 1;
    warnings.push('The government levy is more than the fee. Check the fee.');
  }
  const template = patterns.templates.find((t) => t.match.test(text)) ?? null;
  // A balance notice has no reference or date to miss.
  const isMoney = type !== 'UNKNOWN' && type !== 'BALANCE_NOTIFICATION';
  if (!id && isMoney) {
    warnings.push(
      'No transaction reference found - only the exact same message is caught as a repeat.',
    );
  }
  if (when.warning && isMoney) warnings.push(when.warning);
  if (template?.caution && isMoney) warnings.push(template.caution);
  if (status === 'FAILED')
    warnings.push('The message says the transaction failed: no money moved.');
  if (status === 'PENDING') warnings.push('The message says the transaction is still pending.');

  const party = !!(
    sender?.name ||
    sender?.phone ||
    recipient?.name ||
    recipient?.phone ||
    merchant?.name ||
    bank?.name
  );
  const { confidence, factors } = scoreTzConfidence({
    operatorScore: evidence.score,
    typeKnown: type !== 'UNKNOWN',
    amount: amount != null,
    transactionId: id != null,
    party,
    balance: balance != null,
    date: when.date != null,
    time: when.time != null,
    problems,
  });

  return {
    operator: patterns.operator,
    transactionType: type,
    status,
    direction,
    transactionId: id?.value ?? null,
    amount,
    currency: 'TZS',
    fee,
    governmentLevy: levy,
    balance,
    sender,
    recipient,
    merchant,
    bank,
    // As the message writes it ("Halo Pesa", "M-PESA").
    network,
    reference: hooks.reference?.(text) ?? null,
    billReference: idValue(C.billReference.exec(text)?.[1]),
    paymentType: C.paymentType.exec(text)?.[1]?.trim() ?? null,
    controlNumber: idValue(C.controlNumber.exec(text)?.[1]),
    description: kind.reason,
    transactionAt: transactionAt(when),
    transactionTime: when.time,
    confidence,
    factors,
    parserVersion: PARSER_VERSION,
    template: template?.id ?? null,
    nonTransaction: kind.notMoney,
    signals: evidence.signals,
    warnings,
    parsed: true,
    verified: false,
    rawSms: message.raw,
    senderId: message.senderRaw,
  };
}

/** An operator's parser (§36): its own patterns first, then the shared vocabulary. */
export function createOperatorParser(
  patterns: OperatorPatterns,
  hooks: ParserHooks = {},
): SmsParser {
  return {
    operator: patterns.operator,
    canParse: (message) => operatorEvidence(message, patterns).score > 0,
    parse(message) {
      const evidence = operatorEvidence(message, patterns);
      if (evidence.score <= 0) return null;
      return readTransaction(message, patterns, hooks, evidence);
    },
  };
}
