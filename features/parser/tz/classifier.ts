/**
 * Stages 2-4 of the pipeline (§2): which operator, which way the money moved,
 * and what kind of transaction it was.
 *
 * No single word decides anything (§2, §41). An operator is weighed from
 * independent signals (§28): its sender ID, its name in the message, and the
 * wording documented for it, less the evidence for any other operator. A
 * transaction kind needs its own words AND an amount, and specialized kinds
 * are tried before the generic ones (§29).
 */
import { OPERATOR_INFO, SENDER_ID_HINTS } from './types/operator';
import type { NormalizedSmsMessage } from './types/parser-result';
import type { Direction, TzStatus, TzTransactionType } from './types/transaction';
import { ALL_OPERATOR_PATTERNS, type OperatorPatterns } from './patterns';

/** §28's example weights. */
export const SIGNAL_WEIGHTS = {
  senderId: 0.5,
  brand: 0.35,
  marker: 0.25,
  /** At most this many markers count: a long message is not more certain. */
  maxMarkers: 2,
  otherOperator: -0.3,
} as const;

export interface OperatorEvidence {
  /** 0 to 1. */
  score: number;
  signals: string[];
}

/**
 * The message with the other side of a transfer blanked out: in "kwenda kwa
 * mpokeaji wa Halo Pesa" or "Payment To TIPS-Mixx", the network named is the
 * recipient's, not the operator that sent the message.
 */
const COUNTERPARTY_PHRASES = [
  /\b(?:kwenda|kutoka)\s+(?:kwa\s+)?(?:mpokeaji\s+wa\s+)?[A-Z][\w-]*(?:\s+(?:pesa|money))?/gi,
  /\b(?:payment|paid|sent)\s+to\b[^,\n]*/gi,
];

export function ownWords(text: string): string {
  return COUNTERPARTY_PHRASES.reduce((t, phrase) => t.replace(phrase, ' '), text);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function operatorEvidence(
  message: NormalizedSmsMessage,
  patterns: OperatorPatterns,
): OperatorEvidence {
  const info = OPERATOR_INFO[patterns.operator];
  const own = ownWords(message.text);
  const signals: string[] = [];
  let score = 0;

  const sender = message.senderNormalized;
  if (sender && SENDER_ID_HINTS[patterns.operator].includes(sender)) {
    score += SIGNAL_WEIGHTS.senderId;
    signals.push(`Sender ID "${sender}"`);
  }
  if (patterns.brand.test(own)) {
    score += SIGNAL_WEIGHTS.brand;
    signals.push(`The message names ${info.name}`);
  }
  const markers = patterns.markers.filter((m) => m.match.test(message.text));
  score += Math.min(markers.length, SIGNAL_WEIGHTS.maxMarkers) * SIGNAL_WEIGHTS.marker;
  signals.push(...markers.map((m) => `Has ${m.reason}`));

  if (score > 0) {
    for (const other of ALL_OPERATOR_PATTERNS) {
      if (other.operator === patterns.operator) continue;
      const otherSender = !!sender && SENDER_ID_HINTS[other.operator].includes(sender);
      if (
        otherSender ||
        other.brand.test(own) ||
        other.markers.some((m) => m.match.test(message.text))
      ) {
        score += SIGNAL_WEIGHTS.otherOperator;
        signals.push(`Also looks like ${OPERATOR_INFO[other.operator].name}`);
      }
    }
  }

  return { score: round2(Math.min(1, Math.max(0, score))), signals };
}

// ─── Direction and status ───────────────────────────────────────────────────

const IN_WORDS =
  /\b(?:umepokea|imepokelewa|umepokelewa|umetumiwa|umewekewa|umerudishiwa|umerejeshewa|received|credited|imeingizwa)\b/i;
const OUT_WORDS =
  /\b(?:umetuma|imetumwa|umelipa|umelipia|umenunua|umetoa|sent|paid|debited|malipo|payment|kwenda)\b/i;

/** Whichever comes first: "Umepokea malipo" is money in. */
export function detectDirection(text: string): Direction | null {
  const inAt = text.search(IN_WORDS);
  const outAt = text.search(OUT_WORDS);
  if (inAt < 0 && outAt < 0) return null;
  if (outAt < 0) return 'in';
  if (inAt < 0) return 'out';
  return inAt < outAt ? 'in' : 'out';
}

const FAILED =
  /\b(?:imeshindwa|umeshindwa|haikufanikiwa|haukufanikiwa|haujafanikiwa|failed|unsuccessful|declined|imekataliwa)\b|\bsalio\s+(?:lako\s+)?halitoshi\b|\binsufficient\s+(?:funds|balance)\b/i;
const PENDING = /\bpending\b|\binasubiri\b|\binashughulikiwa\b|\bin\s+progress\b/i;

export function detectStatus(text: string): TzStatus {
  if (FAILED.test(text)) return 'FAILED';
  if (PENDING.test(text)) return 'PENDING';
  return 'SUCCESS';
}

// ─── Transaction kind ───────────────────────────────────────────────────────

/** Codes and passwords: never a transaction, and never extracted (§46). */
const SECRET =
  /\b(?:OTP|one[-\s]?time\s+(?:password|pin|code)|verification\s+code|nenosiri|namba\s+ya\s+siri|password)\b|\bPIN\s+(?:yako|ni|code)\b/i;
const PROMO =
  /\b(?:bonasi|bonus|ofa|offer|promo(?:tion)?|zawadi|shinda|bofya|jiunge|jisajili)\b|\*\d{2,3}(?:\*\d+)*#/i;

const WORDS = {
  reversal:
    /\brevers(?:al|ed)\b|\bimerejeshwa\b|\bumerejeshewa\b|\bmarejesho\b|\bimerudishwa\b|\bumerudishiwa\b/i,
  refund: /\brefund(?:ed)?\b/i,
  bank: /\b(?:NMB|CRDB|NBC|ABSA|KCB|DTB|EQUITY|STANBIC|EXIM|AZANIA|AKIBA|BANK|BENKI)\b/i,
  bankAction:
    /\b(?:akaunti|account|a\/c|imetumwa|umepokea|umetuma|kutoka|kwenda|transfer(?:red)?)\b/i,
  government: /\bGePG\b|\bcontrol\s*(?:number|no)\b|\bpayment\s*id\b|\bmalipo\s+ya\s+serikali\b/i,
  international:
    /\binternational\b|\bkimataifa\b|\bnje\s+ya\s+nchi\b|\bWorld\s*Remit\b|\bWestern\s+Union\b|\bMoneyGram\b|\bMukuru\b/i,
  // Upper-case LIPA only: "lipa" is also the ordinary verb "to pay".
  merchant: /\bLIPA\b|\bLipa\s+(?:kwa\s+Simu|Namba)\b|\bmerchant\b|\bpay\s+merchant\b|\btill\b/,
  merchantAnyCase: /\bmerchant\b|\blipa\s+kwa\s+simu\b|\bpay\s+merchant\b/i,
  bill: /\bpay\s*bill\b|\bbill\s+(?:reference|number)\b|\bbili\b|\bmalipo\s+yamekamilika\s+kwenda\b|\bLUKU\b|\bDAWASA\b|\bDSTV\b|\bAZAM\b|\bGOtv\b|\bTANESCO\b|\bStarTimes\b/i,
  withdrawal:
    /\bumetoa\b|\bwithdraw(?:n|al)?\b|\bcash[\s-]?out\b|\bkutoa\s+pesa\b|\bada\s+ya\s+kutoa\b/i,
  deposit: /\bdeposit(?:ed)?\b|\bumeweka\b|\bumewekewa\b|\bcash[\s-]?in\b|\bkuweka\s+pesa\b/i,
  airtime: /\bairtime\b|\bmuda\s+wa\s+maongezi\b|\bvocha\b/i,
  bundle: /\bbundles?\b|\bbando\b|\bkifurushi\b|\bvifurushi\b|\b(?:data|internet)\s+package\b/i,
  purchase: /\bumenunua\b|\bpurchased?\b|\bbought\b|\brecharge(?:d)?\b|\bkununua\b/i,
};

export interface TypeClues {
  text: string;
  direction: Direction | null;
  hasAmount: boolean;
  hasBalance: boolean;
}

export interface TypeResult {
  type: TzTransactionType;
  reason: string;
  /** Set when the message is plainly not money: a code or a promotion. */
  notMoney: 'OTP' | 'PROMOTIONAL' | null;
}

interface Rule {
  type: TzTransactionType | ((c: TypeClues) => TzTransactionType);
  test: (c: TypeClues) => boolean;
  reason: string;
}

const notIn = (c: TypeClues) => c.direction !== 'in';

/** §29's priority order: specialized kinds before generic ones. */
const RULES: Rule[] = [
  {
    type: 'REVERSAL',
    test: (c) => c.hasAmount && WORDS.reversal.test(c.text),
    reason: 'Reversal wording',
  },
  {
    type: 'REFUND',
    test: (c) => c.hasAmount && WORDS.refund.test(c.text),
    reason: 'Refund wording',
  },
  {
    type: (c) => (c.direction === 'in' ? 'BANK_TRANSFER_IN' : 'BANK_TRANSFER_OUT'),
    test: (c) => c.hasAmount && WORDS.bank.test(c.text) && WORDS.bankAction.test(c.text),
    reason: 'A bank named with transfer wording',
  },
  {
    type: 'GOVERNMENT_PAYMENT',
    test: (c) => c.hasAmount && WORDS.government.test(c.text),
    reason: 'A GePG control number or payment ID',
  },
  {
    type: 'INTERNATIONAL_TRANSFER',
    test: (c) => c.hasAmount && WORDS.international.test(c.text),
    reason: 'International transfer wording',
  },
  {
    type: 'MERCHANT_PAYMENT',
    test: (c) =>
      c.hasAmount &&
      notIn(c) &&
      (WORDS.merchant.test(c.text) || WORDS.merchantAnyCase.test(c.text)),
    reason: 'A Lipa number or merchant',
  },
  {
    type: 'BILL_PAYMENT',
    test: (c) => c.hasAmount && notIn(c) && WORDS.bill.test(c.text),
    reason: 'A bill or business payment',
  },
  {
    type: 'WITHDRAWAL',
    test: (c) => c.hasAmount && WORDS.withdrawal.test(c.text),
    reason: 'Cash withdrawal wording',
  },
  {
    type: 'DEPOSIT',
    test: (c) => c.hasAmount && WORDS.deposit.test(c.text),
    reason: 'Cash deposit wording',
  },
  {
    type: 'AIRTIME_PURCHASE',
    test: (c) =>
      c.hasAmount &&
      WORDS.airtime.test(c.text) &&
      (WORDS.purchase.test(c.text) || c.direction === 'out'),
    reason: 'Airtime bought',
  },
  {
    type: 'BUNDLE_PURCHASE',
    test: (c) =>
      c.hasAmount &&
      WORDS.bundle.test(c.text) &&
      (WORDS.purchase.test(c.text) || c.direction === 'out'),
    reason: 'A bundle bought',
  },
  {
    type: 'RECEIVED',
    test: (c) => c.hasAmount && c.direction === 'in',
    reason: 'Money received',
  },
  { type: 'SENT', test: (c) => c.hasAmount && c.direction === 'out', reason: 'Money sent' },
  {
    type: 'BALANCE_NOTIFICATION',
    test: (c) => c.hasBalance && !c.hasAmount,
    reason: 'A balance and nothing else',
  },
];

export function classifyTransaction(clues: TypeClues): TypeResult {
  if (SECRET.test(clues.text) && !clues.hasAmount) {
    return { type: 'UNKNOWN', reason: 'A code or password, not a transaction', notMoney: 'OTP' };
  }
  if (PROMO.test(clues.text) && (!clues.hasAmount || clues.direction == null)) {
    return { type: 'UNKNOWN', reason: 'A promotion, not a transaction', notMoney: 'PROMOTIONAL' };
  }
  for (const rule of RULES) {
    if (rule.test(clues)) {
      const type = typeof rule.type === 'function' ? rule.type(clues) : rule.type;
      return { type, reason: rule.reason, notMoney: null };
    }
  }
  return { type: 'UNKNOWN', reason: 'No transaction wording with an amount', notMoney: null };
}

/** Kinds where money came into the wallet: the other party is the sender. */
export function isIncoming(type: TzTransactionType, direction: Direction | null): boolean {
  switch (type) {
    case 'RECEIVED':
    case 'DEPOSIT':
    case 'BANK_TRANSFER_IN':
      return true;
    case 'REVERSAL':
    case 'REFUND':
      return direction !== 'out';
    case 'INTERNATIONAL_TRANSFER':
      return direction === 'in';
    default:
      return false;
  }
}
