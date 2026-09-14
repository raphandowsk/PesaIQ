/**
 * The five Tanzanian mobile-money operators the specification covers (§3).
 *
 * Sender IDs are configuration, not logic (§27): they are hints that add
 * weight to an operator, never proof of one. A message from a plain +255
 * number is still recognized when its wording strongly matches an operator.
 */
export const OPERATORS = [
  'MPESA_TZ',
  'AIRTEL_MONEY_TZ',
  'MIXX_TZ',
  'HALOPESA_TZ',
  'TPESA_TZ',
] as const;
export type Operator = (typeof OPERATORS)[number];

export interface OperatorInfo {
  /** The provider registry's id (features/parser/providers.ts). */
  providerId: string;
  /** How the app names it. */
  name: string;
  /** Short name used in the parser id: "Mixx rules (EXPERIMENTAL)". */
  short: string;
}

export const OPERATOR_INFO: Record<Operator, OperatorInfo> = {
  MPESA_TZ: { providerId: 'mpesa', name: 'M-Pesa', short: 'M-Pesa' },
  AIRTEL_MONEY_TZ: { providerId: 'airtel', name: 'Airtel Money', short: 'Airtel Money' },
  MIXX_TZ: { providerId: 'mixx', name: 'Mixx by Yas', short: 'Mixx' },
  HALOPESA_TZ: { providerId: 'halopesa', name: 'HaloPesa', short: 'HaloPesa' },
  TPESA_TZ: { providerId: 'tpesa', name: 'T-PESA', short: 'T-PESA' },
};

/** Sender IDs documented for each operator (§13, §27). Matched exactly, ignoring case. */
export const SENDER_ID_HINTS: Record<Operator, readonly string[]> = {
  MPESA_TZ: ['M-PESA', 'MPESA', 'VODACOM'],
  AIRTEL_MONEY_TZ: ['AIRTEL', 'AIRTEL MONEY', 'AIRTELMONEY', 'AIRTELMONEYTZ'],
  MIXX_TZ: ['MIXX', 'TIGO', 'TIGOPESA'],
  HALOPESA_TZ: ['HALOPESA', 'HALOTEL'],
  TPESA_TZ: ['TPESA', 'T-PESA', 'TTCL'],
};
