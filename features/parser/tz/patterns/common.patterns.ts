/**
 * The Swahili and English vocabulary every operator shares (§23), and the
 * shape of an operator's own pattern set (§38). Operator patterns are tried
 * first; these are the fallback. Regexes live here and in the other pattern
 * files only, never scattered through the parsers.
 */
import { CUR, NUM } from '../amount';
import type { Operator } from '../types/operator';

const re = (source: string) => new RegExp(source, 'i');

export interface Marker {
  match: RegExp;
  /** Shown in "How we got this": what was recognized. */
  reason: string;
}

/**
 * A documented message layout. `evidence` follows §56: A is a real Tanzanian
 * example or official documentation, B a public example still to be checked
 * against real phones, LOCAL an anonymized message the app's owner supplied.
 */
export interface Template {
  id: string;
  match: RegExp;
  evidence: 'A' | 'B' | 'LOCAL';
  note: string;
  /** Shown as a warning when this layout matched. */
  caution?: string;
}

export interface OperatorPatterns {
  operator: Operator;
  /** The operator's own name in the body (not as the other side of a transfer). */
  brand: RegExp;
  /** Wording documented for this operator's messages: each adds weight (§28). */
  markers: Marker[];
  templates: Template[];
  amount: RegExp[];
  fee: RegExp[];
  balance: RegExp[];
  transactionId: RegExp[];
  /** Who sent money in: capture group 1 is the name, a number, or both. */
  sender: RegExp[];
  /** Who the money went to: capture group 1 as above. */
  recipient: RegExp[];
}

/**
 * Where a name ends: a comma, a sentence end, a line break, a bracket, or the
 * word that starts the next field.
 */
const END = String.raw`(?=\s*(?:,|;|\n|$|\.(?:\s|$)|\()|\s+(?:tarehe|saa|on|at|salio|kiasi|namba|muamala|ref|kumbukumbu|balance|new|ada|gharama|kwenye)\b)`;

/** §7, §11, §20, §22: the same layout is documented for four operators. */
export const SHARED_SENT_KIASI: Template = {
  id: 'SHARED_SENT_KIASI',
  match: /\bumetuma\s+pesa\s+kwa\s+[^,\n]+,\s*kiasi/i,
  evidence: 'B',
  note: 'Documented for M-Pesa, Airtel Money, HaloPesa and T-PESA alike: it cannot name the operator on its own',
};

export const COMMON_PATTERNS = {
  amount: [
    re(String.raw`\bumepokea\s*(?:${CUR}\s*${NUM}|${NUM}\s*${CUR})`),
    re(String.raw`\bumetuma\s+(?:kikamilifu\s+)?${CUR}\s*${NUM}`),
    re(String.raw`\bumetuma\s+pesa\s+kwa\s+[^,\n]+,\s*kiasi\s*(?:cha\s*)?${CUR}\s*${NUM}`),
    re(String.raw`\bkiasi\s*(?:cha\s*)?(?:ulicho\s*lipa\s*)?:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\btransaction\s+amount\s*:?\s*(?:${CUR}\s*${NUM}|${NUM}\s*TZS)`),
    re(String.raw`${CUR}\s*${NUM}\s+(?:sent|paid)\s+to\b`),
    re(
      String.raw`\b(?:received|umelipa|umelipia|umenunua|umetoa|umeweka|imetumwa|imepokelewa)\s+(?:${CUR}\s*${NUM}|${NUM}\s*${CUR})`,
    ),
    re(String.raw`\b(?:imethibitishwa|confirmed)\.?\s*${CUR}\s*${NUM}`),
  ],
  fee: [
    re(String.raw`\bjumla\s+ya\s+makato\s*(?:ni\s*)?:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\bgharama\s*(?:ni\s*)?:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\bada\s+ya\s+kutoa\s*(?:ni\s*)?:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\bada\s*(?:ni\s*)?:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\btotal\s+fees?\s*:?\s*(?:${CUR}\s*${NUM}|${NUM}\s*TZS)`),
    re(String.raw`\b(?:transaction\s+)?(?:fee|charges?)\s*:?\s*${CUR}\s*${NUM}`),
  ],
  /** "Ada ----": the layout's way of saying no fee. */
  noFee: /\bada\s*:?\s*-{2,}/i,
  // HaloPesa's "TOZO ya serikali TSH …" and Mixx's plain "Tozo TSh …".
  levy: [re(String.raw`\btozo(?:\s+(?:ya|la)\s+serikali)?\s*:?\s*${CUR}\s*${NUM}`)],
  balance: [
    re(String.raw`\bsalio\s+lako\s+jipya\s+ni\s*:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\bsalio\s+lako\s+la\s+[\w-]+(?:\s+pesa)?\s+ni\s*:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\bsalio\s+jipya\s*(?:ni\s*)?:?\s*${CUR}\s*${NUM}`),
    re(String.raw`\bsalio\s+lako\s+ni\s*:?\s*(?:${CUR}\s*${NUM}|${NUM}\s*${CUR})`),
    re(String.raw`\b(?:new\s+)?balance\s*(?:is\s*)?:?\s*(?:${CUR}\s*${NUM}|${NUM}\s*${CUR})`),
    re(String.raw`\bsalio\s*(?:ni\s*)?:?\s*${CUR}\s*${NUM}`),
  ],
  sender: [
    re(String.raw`\bkutoka\s*\(\s*jina\s+la\s+akaunti\s*:\s*([^)\n]+?)\s*\)`),
    // "kutoka M-PESA, jina NAME": the network, then the person.
    re(String.raw`\bkutoka\s+[A-Z][\w-]*(?:\s+(?:pesa|money))?\s*,\s*jina\s+(.+?)${END}`),
    re(String.raw`\bna\s+wakala\s+(.+?)${END}`),
    re(String.raw`\bkutoka\s+(?:kwa\s+)?(.+?)${END}`),
    re(String.raw`\bfrom\s+(.+?)${END}`),
  ],
  recipient: [
    // An agent: "Umetuma pesa kwa Wakala - NAME, kiasi …" names the agent after the dash.
    re(String.raw`\bumetuma\s+pesa\s+kwa\s+wakala\s*-?\s*([^,\n]+?)\s*,\s*kiasi`),
    re(String.raw`\bumetuma\s+pesa\s+kwa\s+([^,\n]+?)\s*,\s*kiasi`),
    re(String.raw`\bjina\s+la\s+mpokeaji\s*:?\s*(.+?)${END}`),
    // "kwenda M-PESA, jina NAME": the network, then the person.
    re(String.raw`\bkwenda\s+[A-Z][\w-]*(?:\s+(?:pesa|money))?\s*,\s*jina\s+(.+?)${END}`),
    re(String.raw`\bmerchant\s+payment\s+to\s*\n?\s*(\d{4,10}\s*-\s*(?:LIPA\s*)?\n?\s*[^\n,]+)`),
    re(String.raw`\bpayment\s+to\s+([^\n]+)`),
    re(String.raw`\b(?:sent|paid)\s+to\s+(.+?)${END}`),
    re(String.raw`\bimetumwa\s+kwa\s+(.+?)${END}`),
    re(String.raw`\bkwa\s+wakala\s+(.+?)${END}`),
    re(String.raw`\b(?:umetuma|umelipa|umelipia)\s+${CUR}\s*[\d,.]+\s+kwa\s+(.+?)${END}`),
    re(String.raw`\bkwenda\s+(?:kwa\s+)?(.+?)${END}`),
  ],
  billReference: /\bbill\s+reference\s*:?\s*([\w-]+)/i,
  paymentType: /\bpayment\s+type\s*:?\s*([^\n]+)/i,
  controlNumber: /\bcontrol\s*(?:number|no\.?|namba)\s*:?\s*(\d{6,20})/i,
  bankName: /\b(NMB|CRDB|NBC|ABSA|KCB|DTB|EQUITY|STANBIC|EXIM|AZANIA|AKIBA)\b/i,
  bankAccount: /\b(?:akaunti|account|a\/c)\s*(?:namba|no\.?|number)?\s*:?\s*([\d*]{6,20})/i,
  /** The network on the other side: "kwenda M-PESA", "kutoka Airtel Money". */
  network:
    /\b(?:kwenda|kutoka)\s+(?:kwa\s+)?(M[-\s]?PESA|Airtel(?:\s*Money)?|Mixx|Tigo\s*Pesa|Halo\s*Pesa|T[-\s]?PESA)\b/i,
};
