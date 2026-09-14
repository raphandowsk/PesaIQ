/**
 * Airtel Money (§11-§13). Evidence: a documented received message ("Txn Id :
 * …, Umepokea 172.00 Tshs, kutoka (Jina la Akaunti: …)") and the fields of
 * the send confirmation.
 */
import { NUM } from '../amount';
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
  ],
  templates: [
    {
      id: 'AIRTEL_RECEIVED',
      match: /\btxn\s*id\b[\s\S]*\bumepokea\b[\s\S]*\btshs\b/i,
      evidence: 'A',
      note: '§12: documented received message',
    },
    SHARED_SENT_KIASI,
  ],
  amount: [new RegExp(String.raw`\bumepokea\s*${NUM}\s*Tshs?\b`, 'i')],
  fee: [],
  balance: [new RegExp(String.raw`\bsalio\s+lako\s+ni\s*${NUM}\s*Tshs?\b`, 'i')],
  transactionId: [/\btxn\s*id\s*[:-]?\s*(?=[A-Z0-9.]*\d)([A-Z0-9][A-Z0-9.]{5,40})/i],
  sender: [],
  // The send confirmation's fields: "Kwenda Kwa No: 06…", then "Jina La Mpokeaji: NAME".
  recipient: [
    /\bkwenda\s+kwa\s+no\s*:?\s*((?:\+?255|0)[67]\d{8})\s*\n?\s*jina\s+la\s+mpokeaji\s*:?\s*([^\n]+)/i,
  ],
};
