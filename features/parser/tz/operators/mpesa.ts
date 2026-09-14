import { MPESA_PATTERNS } from '../patterns';
import { createOperatorParser } from './base';

/** Vodacom M-Pesa: received, sent, merchant, bill receipt and bank layouts (§6-§10). */
export const mpesaParser = createOperatorParser(MPESA_PATTERNS);
