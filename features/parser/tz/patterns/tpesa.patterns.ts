/**
 * T-PESA (TTCL), §22. Far less public material exists than for the others:
 * one public example, in the layout also documented for M-Pesa, Airtel Money
 * and HaloPesa. It is NOT the complete T-PESA SMS format, so a T-PESA reading
 * needs the sender ID or the T-PESA name in the message, and its layout is
 * reported as TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE. Add templates here as
 * real T-PESA messages are captured.
 */
import { type OperatorPatterns } from './common.patterns';

export const TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE = 'TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE';

export const TPESA_PATTERNS: OperatorPatterns = {
  operator: 'TPESA_TZ',
  brand: /\bT[-\s]?PESA\b|\bTTCL\b/i,
  markers: [],
  templates: [
    {
      id: TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE,
      match: /\bumetuma\s+pesa\s+kwa\s+[^,\n]+,\s*kiasi/i,
      evidence: 'B',
      note: '§22: one public example; not the complete T-PESA format',
      caution: 'T-PESA is known from one public example so far. Check the details.',
    },
  ],
  amount: [],
  fee: [],
  balance: [],
  transactionId: [],
  sender: [],
  recipient: [],
};
