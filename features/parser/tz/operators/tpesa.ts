import { TPESA_PATTERNS } from '../patterns';
import { createOperatorParser } from './base';

/**
 * T-PESA (§22): one public example so far, reported as
 * TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE. Recognized only with its sender ID
 * or its name in the message, since the layout is shared with other operators.
 */
export const tpesaParser = createOperatorParser(TPESA_PATTERNS);
