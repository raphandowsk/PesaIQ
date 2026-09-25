/**
 * HaloPesa (§19-§21). Evidence: a recent structured transfer ("Utambulisho wa
 * Muamala: …, Umetuma TSH … kwenda M-PESA, jina …, gharama TSH … (HaloPesa
 * TSH … + TOZO ya serikali TSH …), wakati 2025/03/29 13:32:54") and the
 * older shared layout.
 */
import { CUR, NUM } from '../amount';
import { SHARED_SENT_KIASI, type OperatorPatterns } from './common.patterns';

/** "1,000 TZS" as the English layout writes every amount. */
const TZS = String.raw`${NUM}\s*(?:TZS|TSH)\b`;
/** The same amount, captured by nothing: for patterns whose groups are the name. */
const PAST_AMOUNT = String.raw`[\d,.]+\s*(?:TZS|TSH)\b`;
/** The name up to the bracket, comma, "at" or the end of the line. */
const NAME_END = String.raw`(?=\s*[(,]|\s+at\s|\s*$)`;

export const HALOPESA_PATTERNS: OperatorPatterns = {
  operator: 'HALOPESA_TZ',
  brand: /\bHalo\s*Pesa\b/i,
  markers: [
    { match: /\butambulisho\s+wa\s+muamala\b/i, reason: 'the "Utambulisho wa Muamala" label' },
    { match: /\bgharama\s+TSH\b/i, reason: 'the "gharama TSH" charges line' },
    { match: /\btozo\s+ya\s+serikali\b/i, reason: 'the "TOZO ya serikali" levy line' },
    // Not "Salio lako jipya ni": Mixx's Lipa payments use it too (2026-09-15),
    // so it no longer points to HaloPesa. The balance is still read from it.
    { match: /\bwakati\s+\d{4}\/\d{2}\/\d{2}\b/i, reason: 'the "wakati yyyy/mm/dd" timestamp' },
    { match: /\bkiasi\s+ulicho\s*lipa\b/i, reason: 'the "Kiasi Ulicho lipa" line' },
    { match: /\btnx\s+\d{8,}/i, reason: 'the "Tnx" transaction number' },
    { match: /^\s*SUCCESSFUL!/im, reason: 'the "SUCCESSFUL!" heading' },
  ],
  templates: [
    {
      id: 'HALOPESA_MODERN',
      match: /\butambulisho\s+wa\s+muamala\b[\s\S]*\bgharama\b/i,
      evidence: 'A',
      note: '§21: recent structured transfer',
    },
    {
      id: 'HALOPESA_TNX',
      match: /\btnx\s+\d{8,}\b[\s\S]*\b(?:sent|received|bought)\b/i,
      evidence: 'LOCAL',
      note: "§19: the owner's own HaloPesa messages, in English",
    },
    SHARED_SENT_KIASI,
  ],
  amount: [
    new RegExp(String.raw`\bumetuma\s+TSH\s*${NUM}`, 'i'),
    new RegExp(String.raw`\b(?:sent|received)\s+${TZS}`, 'i'),
    new RegExp(String.raw`\bbought\s+[A-Z]{2,12}\s+${TZS}`, 'i'),
  ],
  fee: [
    new RegExp(String.raw`\bgharama\s+${CUR}\s*${NUM}`, 'i'),
    new RegExp(String.raw`\bfee\s*:?\s*${TZS}`, 'i'),
  ],
  balance: [new RegExp(String.raw`\bsalio\s+lako\s+jipya\s+ni\s+${CUR}\s*${NUM}`, 'i')],
  transactionId: [
    /\butambulisho\s+wa\s+muamala\s*:\s*([A-Z0-9-]{6,40})/i,
    /\btnx\s*[:.]?\s*(\d{8,20})/i,
  ],
  sender: [
    // "Received 1,000 TZS from NAME (255660000456) via Airtel Money".
    new RegExp(
      String.raw`\breceived\s+${PAST_AMOUNT}\s+from\s+([^(,\n]+?)\s*\(\s*((?:\+?255|0)\d{8,9})`,
      'i',
    ),
    new RegExp(String.raw`\breceived\s+${PAST_AMOUNT}\s+from\s+([^(,\n]+?)${NAME_END}`, 'i'),
  ],
  recipient: [
    // "Sent 1,000 TZS to M-Pesa, name LIPA NAME (Ref 54000321)": the network,
    // the merchant, then its Lipa number.
    new RegExp(
      String.raw`\bto\s+[A-Z][\w-]*(?:[\s-]?(?:pesa|money))?\s*,\s*name\s+([^(,\n]+?)\s*\(\s*ref\s+(\d{4,15})`,
      'i',
    ),
    new RegExp(
      String.raw`\bto\s+[A-Z][\w-]*(?:[\s-]?(?:pesa|money))?\s*,\s*name\s+([^(,\n]+?)${NAME_END}`,
      'i',
    ),
    // "Sent 1,000 TZS to NAME (0713000123, Mixx by Yas)".
    new RegExp(
      String.raw`\bsent\s+${PAST_AMOUNT}\s+to\s+([^(,\n]+?)\s*\(\s*((?:\+?255|0)\d{8,9})`,
      'i',
    ),
    new RegExp(String.raw`\bsent\s+${PAST_AMOUNT}\s+to\s+([^(,\n]+?)${NAME_END}`, 'i'),
    // "Bought LUKU 4,000 TZS for meter 24300000111".
    new RegExp(
      String.raw`\bbought\s+([A-Z]{2,12})\s+${PAST_AMOUNT}\s+for\s+meter\s+(\d{6,20})`,
      'i',
    ),
  ],
};
