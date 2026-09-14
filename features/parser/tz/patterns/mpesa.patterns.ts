/**
 * Vodacom M-Pesa (§6-§10). Evidence: historical Tanzanian received messages,
 * the current payment receipt, and NMB's M-Pesa to bank documentation.
 */
import { CUR, NUM } from '../amount';
import { SHARED_SENT_KIASI, type OperatorPatterns } from './common.patterns';

export const MPESA_PATTERNS: OperatorPatterns = {
  operator: 'MPESA_TZ',
  brand: /\bM[-\s]?PESA\b/i,
  markers: [
    {
      match: /(?:^|\s)(?=[A-Z0-9]*\d)[A-Z0-9]{6,20}\s+[Ii]methibitishwa\b/,
      reason: 'an M-Pesa confirmation code ("… imethibitishwa")',
    },
    { match: /\bsalio\s+lako\s+la\s+M[-\s]?PESA\b/i, reason: 'the M-Pesa balance line' },
    {
      match: /\bmaking\s+your\s+payment\s+with\s+M[-\s]?Pesa\b/i,
      reason: 'the M-Pesa payment receipt heading',
    },
    {
      match: /\bTransaction\s+Amount\b[\s\S]{0,60}\bTotal\s+fees\b/i,
      reason: 'the M-Pesa receipt layout',
    },
  ],
  // Most specific first: a bank transfer also reads like money received.
  templates: [
    {
      id: 'MPESA_BANK',
      match: /imethibitishwa[\s\S]*(?:imetumwa\s+kwa|kutoka\s+kwa)[\s\S]*(?:bank|NMB|CRDB|NBC)/i,
      evidence: 'A',
      note: "§10: NMB's M-Pesa and bank layout",
    },
    {
      id: 'MPESA_RECEIVED_HISTORICAL',
      match: /imethibitishwa[\s\S]*umepokea[\s\S]*kutoka\s+kwa/i,
      evidence: 'A',
      note: '§6: historical Tanzanian received message',
    },
    {
      id: 'MPESA_BILL_RECEIPT',
      match: /\bTransaction\s+Amount\b[\s\S]*\bReceipt\s+Number\b/i,
      evidence: 'A',
      note: '§9: current payment receipt',
    },
    {
      id: 'MPESA_MERCHANT',
      match: /\bmerchant\s+payment\s+to\b/i,
      evidence: 'A',
      note: '§8: merchant payment',
    },
    SHARED_SENT_KIASI,
  ],
  amount: [
    new RegExp(String.raw`\bimethibitishwa\s+umepokea\s*${CUR}\s*${NUM}`, 'i'),
    new RegExp(String.raw`\bTransaction\s+Amount\s*:?\s*${NUM}\s*TZS`, 'i'),
  ],
  fee: [new RegExp(String.raw`\bTotal\s+fees?\s*:?\s*${NUM}\s*TZS`, 'i')],
  balance: [new RegExp(String.raw`\bsalio\s+lako\s+la\s+M[-\s]?PESA\s+ni\s*${CUR}\s*${NUM}`, 'i')],
  transactionId: [
    /\bReceipt\s+Number\s*:?\s*([A-Z0-9][A-Z0-9-]{5,40})/i,
    // The code M-Pesa opens with is the transaction's own: it wins over a
    // reversed transaction's code quoted later in the message.
    /(?:^|\s)(?=[A-Z0-9]*\d)([A-Z0-9]{6,20})\s+(?:[Ii]methibitishwa|[Cc]onfirmed)\b/,
  ],
  sender: [],
  recipient: [],
};
