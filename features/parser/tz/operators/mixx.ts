import { extractReceiptNumber, extractRecipient } from '../../recipient';
import { MIXX_PATTERNS } from '../patterns';
import { maskNumber } from '../phone';
import { createOperatorParser } from './base';

/**
 * Mixx by Yas (§14-§18). Its send layouts name the recipient's network, a
 * Lipa number or a business ("kwenda kwa Vodacom LIPA NAME-12345678",
 * "Malipo yamekamilika kwenda NAME, Kiasi …"): read by the rules built from
 * the owner's own Mixx messages (features/parser/recipient.ts).
 */
export const mixxParser = createOperatorParser(MIXX_PATTERNS, {
  counterparty(text) {
    const r = extractRecipient(text);
    if (!r) return null;
    const number = maskNumber(r.number);
    return {
      party: { name: r.name, phone: r.merchant ? null : number },
      merchant: r.merchant ? { name: r.name, number } : null,
      network: r.network,
    };
  },
  reference: extractReceiptNumber,
});
