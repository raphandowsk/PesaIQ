/**
 * HaloPesa (§19-§21). Evidence: a recent structured transfer ("Utambulisho wa
 * Muamala: …, Umetuma TSH … kwenda M-PESA, jina …, gharama TSH … (HaloPesa
 * TSH … + TOZO ya serikali TSH …), wakati 2025/03/29 13:32:54") and the
 * older shared layout.
 */
import { CUR, NUM } from '../amount';
import { SHARED_SENT_KIASI, type OperatorPatterns } from './common.patterns';

export const HALOPESA_PATTERNS: OperatorPatterns = {
  operator: 'HALOPESA_TZ',
  brand: /\bHalo\s*Pesa\b/i,
  markers: [
    { match: /\butambulisho\s+wa\s+muamala\b/i, reason: 'the "Utambulisho wa Muamala" label' },
    { match: /\bgharama\s+TSH\b/i, reason: 'the "gharama TSH" charges line' },
    { match: /\btozo\s+ya\s+serikali\b/i, reason: 'the "TOZO ya serikali" levy line' },
    { match: /\bsalio\s+lako\s+jipya\s+ni\b/i, reason: 'the "Salio lako jipya ni" balance line' },
    { match: /\bwakati\s+\d{4}\/\d{2}\/\d{2}\b/i, reason: 'the "wakati yyyy/mm/dd" timestamp' },
    { match: /\bkiasi\s+ulicho\s*lipa\b/i, reason: 'the "Kiasi Ulicho lipa" line' },
  ],
  templates: [
    {
      id: 'HALOPESA_MODERN',
      match: /\butambulisho\s+wa\s+muamala\b[\s\S]*\bgharama\b/i,
      evidence: 'A',
      note: '§21: recent structured transfer',
    },
    SHARED_SENT_KIASI,
  ],
  amount: [new RegExp(String.raw`\bumetuma\s+TSH\s*${NUM}`, 'i')],
  fee: [new RegExp(String.raw`\bgharama\s+${CUR}\s*${NUM}`, 'i')],
  balance: [new RegExp(String.raw`\bsalio\s+lako\s+jipya\s+ni\s+${CUR}\s*${NUM}`, 'i')],
  transactionId: [/\butambulisho\s+wa\s+muamala\s*:\s*([A-Z0-9-]{6,40})/i],
  sender: [],
  recipient: [],
};
