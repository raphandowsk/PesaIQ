import { AIRTEL_PATTERNS } from '../patterns';
import { createOperatorParser } from './base';

/** Airtel Money: the documented received message and the shared send layout (§11-§13). */
export const airtelMoneyParser = createOperatorParser(AIRTEL_PATTERNS);
