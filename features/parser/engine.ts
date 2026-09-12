/**
 * The parser engine: normalize, classify, extract, score.
 *
 * Ported from `runParse()` in the design canvas, then extended with fees,
 * taxes, categories and the real Mixx and LUKU layouts. Pure and synchronous -
 * no I/O, no dates read from the clock, no randomness - so a given message
 * always produces the same result and the tests can pin exact numbers.
 */
import { formatAmount as formatMoney } from '../../utils/format';
import {
  CATEGORY_TO_TYPE,
  DEFAULT_CURRENCY,
  MONEY_CATEGORY_LABELS,
  TAX_LABELS,
  TYPE_LABELS,
} from '../../types/domain';
import { checkCharges, extractElectricityReceipt, extractFee, extractTaxes } from './charges';
import { classify } from './classifier';
import { isLowConfidenceField, scoreConfidence } from './confidence';
import {
  extractAmount,
  extractBalance,
  extractCounterparty,
  extractDate,
  extractMaskedIdentifier,
  extractReference,
  maskIdentifier,
  type Extracted,
} from './extractors';
import { inferMoneyCategory } from './moneyCategory';
import { normalizationNote, normalize, type NormalizedSms } from './normalizer';
import { detectProvider } from './providers';
import { extractReceiptNumber, extractRecipient } from './recipient';
import type { ChargeDetails, ParseResult, ParsedField, TaxLine } from './schema';

/** Longest message we will attempt. Beyond this the input is likely not an SMS. */
export const MAX_MESSAGE_LENGTH = 1600;

export class EmptyMessageError extends Error {
  constructor() {
    super('Paste a message before analyzing.');
    this.name = 'EmptyMessageError';
  }
}

export class MessageTooLongError extends Error {
  constructor() {
    super('Message is unusually long (over 1,600 characters). Trim it and try again.');
    this.name = 'MessageTooLongError';
  }
}

/** A rule-picked category is a good guess, never an "unsure" one: it is one tap to change. */
const CATEGORY_CONFIDENCE = 0.8;

function buildField(
  key: string,
  label: string,
  value: string | number | null,
  display: string,
  confidence: number,
): ParsedField {
  const asText = value == null ? '' : String(value);
  return {
    key,
    label,
    value: asText,
    display,
    confidence,
    low: isLowConfidenceField(confidence),
    missing: asText === '',
  };
}

/** Format a number the way the UI shows money. */
export function formatAmount(n: number | null | undefined): string {
  if (n == null) return '-';
  // Shared with the UI so a figure reads the same on every screen, and so the
  // parser does not depend on per-device Intl data.
  return formatMoney(n);
}

const money = (n: number) => `${DEFAULT_CURRENCY} ${formatAmount(n)}`;
const cents = (n: number) => Math.round(n * 100) / 100;

/** "VAT TZS 69 (in the fee)", or "VAT 18% TZS 2,729.50 · EWURA 1% TZS 151.64". */
function describeTaxes(taxes: readonly TaxLine[]): string {
  return taxes
    .map((t) => {
      const rate = t.ratePct == null ? '' : ` ${t.ratePct}%`;
      const where = t.within === 'fee' ? ' (in the fee)' : t.within === 'extra' ? ' (on top)' : '';
      return `${TAX_LABELS[t.code]}${rate} ${money(t.amount)}${where}`;
    })
    .join(' · ');
}

/**
 * Parse an already-normalized message.
 *
 * Prefer `parseMessage`, which normalizes first. This overload exists for
 * Stage 2, where the native source normalizes before handing work over.
 */
export function parseNormalized(sms: NormalizedSms): ParseResult {
  const text = sms.normalizedText;

  // The demo samples carry their sender inline; a real source passes it in.
  const sender = sms.sender || /DEMO-[A-Z-]+/.exec(text)?.[0] || undefined;

  const classification = classify(text);
  const provider = detectProvider(text, sender);
  const type = CATEGORY_TO_TYPE[classification.category];

  // A LUKU receipt itemises its own total. The generic amount rule would read a
  // group of the token as the amount.
  const receipt = extractElectricityReceipt(text);
  const recipient = extractRecipient(text);

  const amount: Extracted<number> =
    receipt?.total != null ? { value: receipt.total, confidence: 0.93 } : extractAmount(text);
  const balance = extractBalance(text);
  const reference: Extracted<string> = receipt?.reference
    ? { value: receipt.reference, confidence: 0.9 }
    : extractReference(text);
  const counterparty: Extracted<string> = recipient
    ? { value: recipient.name, confidence: 0.92 }
    : receipt
      ? { value: 'LUKU electricity', confidence: 0.8 }
      : extractCounterparty(text);
  const identifier: Extracted<string> = recipient?.number
    ? { value: maskIdentifier(recipient.number), confidence: 0.85 }
    : receipt?.meterNumber
      ? { value: receipt.meterNumber, confidence: 0.8 }
      : extractMaskedIdentifier(text);
  const when = extractDate(text);

  const fee = extractFee(text);
  const charges = checkCharges({
    fee: fee.value,
    taxes: extractTaxes(text, { hasFee: fee.value != null, receipt: receipt != null }),
    receipt,
  });
  const taxes = charges.taxes;
  const taxTotal = cents(taxes.reduce((sum, t) => sum + t.amount, 0));

  const details: ChargeDetails = {
    receipt: extractReceiptNumber(text),
    network: recipient?.network ?? null,
    merchant: recipient?.merchant ?? false,
    units: receipt?.units ?? null,
    meterNumber: receipt?.meterNumber ?? null,
    token: receipt?.token ?? null,
    netCost: receipt?.netCost ?? null,
    debtCollected: receipt?.debtCollected ?? null,
  };

  const moneyCategory = inferMoneyCategory({
    type,
    counterparty: counterparty.value,
    text,
    merchant: details.merchant,
    electricity: receipt != null,
  });

  const warnings = [amount.warning, reference.warning, when.warning, ...charges.warnings].filter(
    (w): w is string => !!w,
  );

  const hasAmountWithCurrency = amount.value != null && amount.confidence >= 0.9;

  const { confidence, band, factors } = scoreConfidence({
    hasProvider: provider.name != null,
    hasKnownType: classification.category !== 'OTHER',
    hasAmountWithCurrency,
    hasReference: reference.value != null,
    hasCounterparty: counterparty.value != null,
    hasDate: when.date != null,
    hasBalance: balance.value != null,
    category: classification.category,
    classifierConfidence: classification.confidence,
  });

  const fields: ParsedField[] = [
    buildField(
      'category',
      'Type',
      classification.category,
      `${classification.category.replace(/_/g, ' ')} - ${TYPE_LABELS[type]}`,
      classification.confidence,
    ),
    buildField(
      'moneyCategory',
      'Category',
      moneyCategory,
      moneyCategory ? MONEY_CATEGORY_LABELS[moneyCategory] : 'Not set',
      moneyCategory ? CATEGORY_CONFIDENCE : 0,
    ),
    buildField(
      'provider',
      'Provider',
      provider.name,
      provider.name ?? 'Not recognized',
      provider.confidence,
    ),
    buildField(
      'amount',
      'Amount',
      amount.value,
      amount.value == null ? 'Missing' : money(amount.value),
      amount.confidence,
    ),
    buildField(
      'fee',
      // The message's own figure: any VAT inside it is counted under taxes.
      'Fee as stated',
      fee.value,
      fee.value == null ? 'None stated' : money(fee.value),
      fee.confidence,
    ),
    buildField(
      'taxes',
      'Taxes',
      taxes.length > 0 ? taxTotal : null,
      taxes.length > 0 ? describeTaxes(taxes) : 'None stated',
      taxes.length > 0 ? charges.taxConfidence : 0,
    ),
    buildField(
      'counterparty',
      'Counterparty',
      counterparty.value,
      counterparty.value ?? 'Not found',
      counterparty.confidence,
    ),
    buildField(
      'masked',
      'Account / phone',
      identifier.value,
      identifier.value ?? 'Not found',
      identifier.confidence,
    ),
    buildField(
      'reference',
      'Reference',
      reference.value,
      reference.value ?? 'Not found',
      reference.confidence,
    ),
    buildField(
      'balance',
      'Balance after',
      balance.value,
      balance.value == null ? 'Not found' : money(balance.value),
      balance.confidence,
    ),
    buildField(
      'date',
      'Date',
      when.date,
      when.date ? `${when.date}${when.time ? ` - ${when.time}` : ''}` : 'Not found',
      when.confidence,
    ),
    ...(receipt
      ? [
          buildField('units', 'Units', receipt.units, receipt.units ?? 'Not found', 0.9),
          buildField(
            'meter',
            'Meter',
            receipt.meterNumber,
            receipt.meterNumber ?? 'Not found',
            receipt.meterNumber ? 0.85 : 0,
          ),
          // Only the last four digits: the token itself stays in `details`,
          // shown on the record when the user asks for it.
          buildField(
            'token',
            'Token',
            receipt.token ? receipt.token.slice(-4) : null,
            receipt.token ? `Hidden · ends ${receipt.token.slice(-4)}` : 'Not found',
            receipt.token ? 0.9 : 0,
          ),
        ]
      : []),
  ];

  return {
    originalText: sms.originalText,
    normalizedText: text,
    normalizationNote: normalizationNote(sms),
    sender,

    category: classification.category,
    type,

    provider: provider.name,
    providerId: provider.id,

    amount: amount.value,
    currency: amount.value == null ? null : DEFAULT_CURRENCY,
    counterparty: counterparty.value,
    maskedAccountOrPhone: identifier.value,
    transactionReference: reference.value,
    balanceAfter: balance.value,
    transactionDate: when.date,
    transactionTime: when.time,

    moneyCategory,
    fee: fee.value,
    taxes,
    details,

    confidence,
    band,
    parserId:
      provider.id === 'mixx'
        ? 'GenericParser + Mixx rules (EXPERIMENTAL)'
        : provider.name
          ? 'GenericParser + provider hints (DEMO)'
          : 'GenericParser (DEMO)',

    warnings,
    reasons: [...classification.reasons, ...charges.reasons],
    factors,
    fields,
  };
}

/**
 * Parse a raw pasted message.
 *
 * @throws EmptyMessageError when there is nothing to parse.
 * @throws MessageTooLongError when the input exceeds MAX_MESSAGE_LENGTH.
 */
export function parseMessage(
  raw: string,
  options: { sender?: string; receivedAt?: string } = {},
): ParseResult {
  if (!raw.trim()) throw new EmptyMessageError();
  if (raw.trim().length > MAX_MESSAGE_LENGTH) throw new MessageTooLongError();

  return parseNormalized(normalize(raw, options));
}
