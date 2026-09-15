/**
 * Transaction IDs (§26): "Kumbukumbu No", "Kumbukumbu Namba", "Txn Id",
 * "Transaction ID", "Receipt Number", "Reference No", "Reference",
 * "Utambulisho wa Muamala", plus M-Pesa's leading code ("R93NY448
 * Imethibitishwa").
 *
 * An ID must contain a digit, so a label followed by an ordinary word
 * ("Kila Muamala ni ...") is never read as one. A "Bill Reference" is the
 * customer's account at the biller, not the transaction, and is skipped here.
 */

/**
 * The value after a label: letters, digits and . _ -, with at least one digit.
 * Up to two separators may come first: Mixx writes "Kumbukumbu no.: 2610…".
 */
const ID = String.raw`\s*(?:[:#.-]\s*){0,2}(?=[A-Z0-9._-]*\d)([A-Z0-9][A-Z0-9._-]{5,40})`;

/** §26's master regex, split so the most specific label wins. */
export const TRANSACTION_ID_LABELS: readonly RegExp[] = [
  new RegExp(String.raw`\butambulisho\s+wa\s+muamala${ID}`, 'i'),
  new RegExp(String.raw`\btxn\s*id${ID}`, 'i'),
  new RegExp(String.raw`\btransaction\s*(?:id|number|no)${ID}`, 'i'),
  new RegExp(String.raw`\breceipt\s*(?:no|number)${ID}`, 'i'),
  new RegExp(String.raw`\bkumbukumbu\s*(?:no|namba)?${ID}`, 'i'),
  new RegExp(String.raw`\bpayment\s*id${ID}`, 'i'),
  new RegExp(String.raw`\b(?:namba\s+ya\s+)?muamala${ID}`, 'i'),
];

const REFERENCE = new RegExp(String.raw`\bref(?:erence)?(?:\s*(?:no|number))?${ID}`, 'gi');

/** "M-PESA T54G0596 imethibitishwa" / "R93NY448 Imethibitishwa". Case-sensitive code. */
const LEADING_CODE =
  /(?:^|\s)(?=[A-Z0-9]*\d)([A-Z0-9]{6,20})\s+(?:[Ii]methibitishwa|[Cc]onfirmed)\b/;

export interface FoundId {
  value: string;
  /** Which label it followed, for "How we got this". */
  label: string;
}

const clean = (raw: string) => raw.replace(/[._-]+$/, '').toUpperCase();

export function extractTransactionId(
  text: string,
  operatorPatterns: readonly RegExp[] = [],
): FoundId | null {
  for (const pattern of [...operatorPatterns, ...TRANSACTION_ID_LABELS]) {
    const m = pattern.exec(text);
    if (m?.[1]) return { value: clean(m[1]), label: m[0].split(/[\s:#.]/)[0] };
  }

  const code = LEADING_CODE.exec(text);
  if (code) return { value: code[1], label: 'confirmation code' };

  for (const m of text.matchAll(REFERENCE)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 5), m.index);
    if (/bill\s*$/i.test(before)) continue;
    return { value: clean(m[1]), label: 'reference' };
  }
  return null;
}
