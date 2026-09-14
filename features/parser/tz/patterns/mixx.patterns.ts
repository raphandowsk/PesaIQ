/**
 * Mixx by Yas, formerly Tigo Pesa (§14-§18). Evidence: the owner's own Mixx
 * messages (2026-09-12, anonymized in tests/fixtures/tz-messages.ts) and
 * Mixx's documented services. Government payments are known from the
 * documentation's indicators only; no raw message has been seen.
 */
import { type OperatorPatterns } from './common.patterns';

export const MIXX_PATTERNS: OperatorPatterns = {
  operator: 'MIXX_TZ',
  brand: /\bMixx\b|\bTigo\s*Pesa\b/i,
  markers: [
    { match: /\bjumla\s+ya\s+makato\b/i, reason: 'the "Jumla ya makato" charges line' },
    { match: /\bbao\s+la\s+ushindi\b/i, reason: 'the "Bao la Ushindi" sign-off' },
    { match: /\bsalio\s+jipya\s+ni\b/i, reason: 'the "Salio jipya ni" balance line' },
    { match: /\bnamba\s+ya\s+muamala\b/i, reason: 'the "Namba ya muamala" label' },
    {
      match: /\bmalipo\s+yamekamilika\s+kwenda\b/i,
      reason: 'the "Malipo yamekamilika kwenda" payment line',
    },
    { match: /\bkwenda\s+kwa\s+mpokeaji\s+wa\b/i, reason: 'the "kwenda kwa mpokeaji wa" line' },
    { match: /\bumetuma\s+kikamilifu\b/i, reason: 'the "Umetuma kikamilifu" opening' },
    { match: /\bkumbukumbu\s+no\.\d/i, reason: 'the "Kumbukumbu no." label' },
  ],
  templates: [
    {
      id: 'MIXX_SENT_KIKAMILIFU',
      match: /\bumetuma\s+kikamilifu\b[\s\S]*\bjumla\s+ya\s+makato\b/i,
      evidence: 'LOCAL',
      note: "The owner's own Mixx messages",
    },
    {
      id: 'MIXX_SENT_MPOKEAJI',
      match: /\bkwenda\s+kwa\s+mpokeaji\s+wa\b/i,
      evidence: 'LOCAL',
      note: "The owner's own Mixx messages",
    },
    {
      id: 'MIXX_PAYMENT_MALIPO',
      match: /\bmalipo\s+yamekamilika\s+kwenda\b/i,
      evidence: 'LOCAL',
      note: "The owner's own Mixx messages",
    },
    {
      id: 'MIXX_GOVERNMENT',
      match: /\bGePG\b|\bcontrol\s*(?:number|no)\b/i,
      evidence: 'B',
      note: '§18: indicators from the documentation, no raw message seen',
    },
    {
      id: 'MIXX_RECEIVED_GENERIC',
      match: /\bumepokea\b/i,
      evidence: 'B',
      note: '§15: the generic received vocabulary',
    },
  ],
  amount: [],
  fee: [],
  balance: [],
  transactionId: [],
  sender: [],
  recipient: [],
};
