/**
 * Stage 2: decide what a message is about, and be able to explain why.
 *
 * Ported from `classify()` in the design canvas. Rules are ordered and the
 * first match wins — OTP and promotional are checked before the transaction
 * verbs so a promo mentioning "received" cannot masquerade as a payment.
 *
 * The Swahili keywords are load-bearing. The interface is English, but the
 * messages are not: a Tanzanian wallet SMS says "Umetuma", not "You sent".
 */
import type { MessageCategory } from '../../types/domain';

export interface ClassificationResult {
  category: MessageCategory;
  confidence: number;
  /** Human-readable, shown verbatim in the result card. */
  reasons: string[];
}

interface Rule {
  category: MessageCategory;
  confidence: number;
  pattern: RegExp;
  reason: string;
  /** Extra condition beyond the pattern. */
  unless?: RegExp;
  /** Reason added only when `unless` was checked and did not fire. */
  extraReason?: string;
}

/** Order matters. */
const RULES: Rule[] = [
  {
    category: 'OTP',
    confidence: 0.9,
    pattern: /\b(otp|one[- ]time|do not share|usitoe|siri)\b/i,
    reason: 'One-time-code wording',
  },
  {
    category: 'PROMOTIONAL',
    confidence: 0.72,
    pattern: /\b(bonasi|bonus|offer|promo|karibu!|bofya|dial \*|win)\b/i,
    // A genuine transaction that happens to say "bonus" must not land here.
    unless: /tzs\s?[\d,]+\.?\d*\s?(received|sent)?/i,
    reason: 'Promotional wording (offer / dial code)',
    extraReason: 'No transaction verbs found',
  },
  {
    category: 'PAYMENT_RECEIVED',
    confidence: 0.92,
    pattern: /\b(received|umepokea|imepokelewa|credited)\b/i,
    reason: 'Incoming-payment wording',
  },
  {
    category: 'WITHDRAWAL',
    confidence: 0.9,
    pattern: /\b(withdraw|withdrawal|umetoa|atm)\b/i,
    reason: 'Withdrawal wording',
  },
  {
    category: 'DEPOSIT',
    confidence: 0.88,
    pattern: /\b(deposit|umeweka)\b/i,
    reason: 'Deposit wording',
  },
  {
    category: 'AIRTIME_PURCHASE',
    confidence: 0.84,
    pattern: /\b(airtime|muda wa maongezi|bando)\b/i,
    reason: 'Airtime wording',
  },
  {
    category: 'BILL_PAYMENT',
    confidence: 0.84,
    pattern: /\b(luku|bili|bill|umelipa|paid to)\b/i,
    reason: 'Bill-payment wording',
  },
  {
    category: 'PAYMENT_SENT',
    confidence: 0.91,
    pattern: /\b(sent|umetuma|debited|transferred)\b/i,
    reason: 'Outgoing-payment wording',
  },
  {
    category: 'BALANCE_UPDATE',
    confidence: 0.7,
    pattern: /\b(salio|balance)\b/i,
    reason: 'Balance-only wording',
  },
];

const CURRENCY_TOKEN = /\bTZS\b/i;
const REFERENCE_TOKEN = /(ref|muamala|txnid|receipt)/i;

/** Ceiling applied after the currency boost. */
const MAX_CLASSIFIER_CONFIDENCE = 0.97;
const CURRENCY_BOOST = 0.03;

/**
 * Classify normalized message text.
 *
 * @param text normalized text — pass `NormalizedSms.normalizedText`, not raw.
 */
export function classify(text: string): ClassificationResult {
  const reasons: string[] = [];
  let category: MessageCategory = 'OTHER';
  let confidence = 0.4;

  for (const rule of RULES) {
    if (!rule.pattern.test(text)) continue;
    if (rule.unless && rule.unless.test(text)) continue;

    category = rule.category;
    confidence = rule.confidence;
    reasons.push(rule.reason);
    if (rule.extraReason) reasons.push(rule.extraReason);
    break;
  }

  if (category === 'OTHER') reasons.push('No known transaction wording matched');

  if (CURRENCY_TOKEN.test(text)) {
    reasons.push('TZS amount present');
    confidence = Math.min(MAX_CLASSIFIER_CONFIDENCE, confidence + CURRENCY_BOOST);
  }

  // Adds explanation but deliberately no confidence: a reference token proves
  // little on its own.
  if (REFERENCE_TOKEN.test(text)) reasons.push('Reference-like token present');

  return { category, confidence, reasons };
}
