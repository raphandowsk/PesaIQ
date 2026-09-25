/**
 * Airtel Money (§11-§13). Evidence: a documented received message ("Txn Id :
 * …, Umepokea 172.00 Tshs, kutoka (Jina la Akaunti: …)") and the fields of
 * the send confirmation.
 */
import { CUR, NUM } from '../amount';
import { SHARED_SENT_KIASI, type OperatorPatterns } from './common.patterns';

export const AIRTEL_PATTERNS: OperatorPatterns = {
  operator: 'AIRTEL_MONEY_TZ',
  brand: /\bAirtel(?:\s*Money)?\b/i,
  markers: [
    { match: /\btxn\s*id\s*:/i, reason: 'the "Txn Id :" label' },
    { match: /\bjina\s+la\s+akaunti\b/i, reason: 'the "Jina la Akaunti" label' },
    { match: /\d\s*Tshs\b/i, reason: 'amounts written "… Tshs"' },
    { match: /\bsalio\s+lako\s+ni\b/i, reason: 'the "salio lako ni" balance line' },
    {
      match: /\bkwenda\s+kwa\s+no\b|\bjina\s+la\s+mpokeaji\b|\bmuda\s+na\s+tarehe\b/i,
      reason: 'the Airtel Money send-confirmation fields',
    },
    { match: /\bTID\s*:/i, reason: 'the "TID:" reference label' },
    {
      // A bare "Salio": Mixx writes "Salio jipya ni", M-Pesa "salio lako la M-PESA ni".
      match: /\bsalio\s+(?:Tshs?\s*[\d,]|[\d,]+(?:\.\d+)?\s*Tshs?\b)/i,
      reason: 'the bare "Salio" balance line',
    },
    {
      // Not "makato" alone: Mixx writes "Jumla ya makato TSh 450, VAT …".
      match: /\bmakato\s+Tshs?\s*[\d,]+(?:\.\d+)?\.?\s*Salio\b/i,
      reason: 'the "Makato … Salio" charges line',
    },
    { match: /\bservice\s+charge\s+Tshs?\b/i, reason: 'the "Service charge" breakdown' },
  ],
  templates: [
    {
      id: 'AIRTEL_RECEIVED',
      match: /\btxn\s*id\b[\s\S]*\bumepokea\b[\s\S]*\btshs\b/i,
      evidence: 'A',
      note: '§12: documented received message',
    },
    {
      id: 'AIRTEL_TID_PAID',
      match: /\bpaid\b[\s\S]*\bcharges\b[\s\S]*\bTID\b/i,
      evidence: 'LOCAL',
      note: "§11: the owner's own Airtel Money payment, in English",
    },
    {
      id: 'AIRTEL_TID_LIPA',
      match: /\bumelipa\b[\s\S]*\bmakato\b[\s\S]*\bTID\b/i,
      evidence: 'LOCAL',
      note: '§11: the Swahili leg of the same payment, through TIPS',
    },
    {
      id: 'AIRTEL_TID_RECEIVED',
      match: /\bumepokea\b[\s\S]*\bsalio\b[\s\S]*\bTID\b/i,
      evidence: 'LOCAL',
      note: "§12: the owner's own Airtel Money received message",
    },
    SHARED_SENT_KIASI,
  ],
  amount: [
    new RegExp(String.raw`\bumepokea\s*${NUM}\s*Tshs?\b`, 'i'),
    new RegExp(String.raw`\b(?:paid|umelipa)\s+${NUM}\s*${CUR}`, 'i'),
  ],
  fee: [new RegExp(String.raw`\bmakato\s+${CUR}\s*${NUM}`, 'i')],
  balance: [new RegExp(String.raw`\bsalio\s+lako\s+ni\s*${NUM}\s*Tshs?\b`, 'i')],
  transactionId: [
    /\btxn\s*id\s*[:-]?\s*(?=[A-Z0-9.]*\d)([A-Z0-9][A-Z0-9.]{5,40})/i,
    /\bTID\s*[:-]?\s*(?=[A-Z0-9.]*\d)([A-Z0-9][A-Z0-9.]{5,40})/i,
  ],
  sender: [],
  // The send confirmation's fields: "Kwenda Kwa No: 06…", then "Jina La Mpokeaji: NAME".
  recipient: [
    /\bkwenda\s+kwa\s+no\s*:?\s*((?:\+?255|0)[67]\d{8})\s*\n?\s*jina\s+la\s+mpokeaji\s*:?\s*([^\n]+)/i,
    // "Paid 1000.00 TZS to 255617000789 NAME.": the number, then the name.
    /\bpaid\s+[\d,.]+\s*(?:TZS|Tshs?)\s+to\s+((?:\+?255|0)\d{8,9})\s+([^.,\n]+)/i,
    // A Lipa number paid through a QR code: "kwa VODALIPA TNQR.LIPA NAME. 54000321".
    /\bkwa\s+[A-Z]+LIPA\b[^\n]*?\bLIPA[.\s]+([^.\n]+?)\.\s*(\d{4,15})/i,
  ],
};
