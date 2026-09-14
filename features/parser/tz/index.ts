/**
 * The Tanzania mobile-money SMS parser (docs/PARSER_ENGINE.md, "Tanzania
 * mobile money").
 *
 * Deterministic and offline: plain TypeScript, no network, no AI, no clock.
 * Every operator parser that finds evidence for itself reads the message;
 * the most confident reading wins (§37). Below 0.50, or with no transaction
 * kind, the message is UNKNOWN: kept for review, never thrown away (§43).
 */
import { TZ_UNKNOWN_BELOW } from './confidence';
import { normalizeSms } from './normalize';
import { airtelMoneyParser } from './operators/airtel-money';
import { PARSER_VERSION } from './operators/base';
import { halopesaParser } from './operators/halopesa';
import { mixxParser } from './operators/mixx';
import { mpesaParser } from './operators/mpesa';
import { tpesaParser } from './operators/tpesa';
import type {
  NormalizedSmsMessage,
  SmsMessage,
  SmsParser,
  TzParseOutcome,
  UnknownSms,
} from './types/parser-result';
import type { ParsedTransaction } from './types/transaction';

export { PARSER_VERSION };

/** In §37's order, which also breaks ties. */
export const OPERATOR_PARSERS: readonly SmsParser[] = [
  mpesaParser,
  airtelMoneyParser,
  mixxParser,
  halopesaParser,
  tpesaParser,
];

export function selectHighestConfidence(results: readonly ParsedTransaction[]): ParsedTransaction {
  return results.reduce((best, r) => (r.confidence > best.confidence ? r : best));
}

export function toUnknownSms(
  message: NormalizedSmsMessage,
  closest: ParsedTransaction | null,
): UnknownSms {
  return {
    classification: 'UNKNOWN',
    rawSms: message.raw,
    senderId: message.senderRaw,
    receivedAt: message.receivedAt,
    parserVersion: PARSER_VERSION,
    closest: closest ? { operator: closest.operator, confidence: closest.confidence } : null,
  };
}

/**
 * Read a message. Null when no operator has any evidence for itself: the
 * message is not recognizably Tanzanian mobile money, and the caller's
 * general rules read it instead.
 */
export function parseTanzaniaSms(message: SmsMessage): TzParseOutcome | null {
  const normalized = normalizeSms(message);
  if (!normalized.text) return null;

  const results = OPERATOR_PARSERS.filter((p) => p.canParse(normalized))
    .map((p) => p.parse(normalized))
    .filter((r): r is ParsedTransaction => r != null);
  if (results.length === 0) return null;

  const best = selectHighestConfidence(results);
  if (best.confidence < TZ_UNKNOWN_BELOW || best.transactionType === 'UNKNOWN') {
    return { kind: 'unknown', unknown: toUnknownSms(normalized, best), closest: best };
  }
  return { kind: 'transaction', transaction: best };
}

/** §37's master parser: the transaction, or null when there is none to trust. */
export function parseTanzaniaTransaction(message: SmsMessage): ParsedTransaction | null {
  const outcome = parseTanzaniaSms(message);
  return outcome?.kind === 'transaction' ? outcome.transaction : null;
}

export { normalizeSms } from './normalize';
export { parseAmount } from './amount';
export { normalizeTzPhone, maskTzPhone } from './phone';
export { extractTzDateTime, displayDate } from './date';
export { extractTransactionId } from './transaction-id';
export { operatorEvidence, classifyTransaction, detectDirection } from './classifier';
export {
  scoreTzConfidence,
  tzConfidenceLevel,
  TZ_CONFIDENCE_WEIGHTS,
  TZ_UNKNOWN_BELOW,
} from './confidence';
export { OPERATORS, OPERATOR_INFO, SENDER_ID_HINTS } from './types/operator';
export type { Operator } from './types/operator';
export { TZ_TRANSACTION_TYPES, TZ_TYPE_LABELS } from './types/transaction';
export type { ParsedTransaction, TzTransactionType, TzStatus } from './types/transaction';
export type { SmsMessage, TzParseOutcome, UnknownSms } from './types/parser-result';
export { TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE } from './patterns';
