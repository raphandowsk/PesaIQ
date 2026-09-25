import { AIRTEL_PATTERNS } from './airtel.patterns';
import type { OperatorPatterns } from './common.patterns';
import { HALOPESA_PATTERNS } from './halopesa.patterns';
import { MIXX_PATTERNS } from './mixx.patterns';
import { MPESA_PATTERNS } from './mpesa.patterns';
import { TPESA_PATTERNS } from './tpesa.patterns';

export { COMMON_PATTERNS, NETWORK_NAMES, SHARED_SENT_KIASI } from './common.patterns';
export type { Marker, OperatorPatterns, Template } from './common.patterns';
export { AIRTEL_PATTERNS, HALOPESA_PATTERNS, MIXX_PATTERNS, MPESA_PATTERNS, TPESA_PATTERNS };
export { TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE } from './tpesa.patterns';

/** Every operator's patterns: each counts against the others (§28). */
export const ALL_OPERATOR_PATTERNS: readonly OperatorPatterns[] = [
  MPESA_PATTERNS,
  AIRTEL_PATTERNS,
  MIXX_PATTERNS,
  HALOPESA_PATTERNS,
  TPESA_PATTERNS,
];
