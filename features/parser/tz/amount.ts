/**
 * Amounts in every way Tanzanian messages write them (§24): "Tsh 10,000",
 * "Tsh. 10,000", "Tsh10,000", "TZS 10,000", "TSH 10,000.00", "10,000 Tsh",
 * "10,000 TZS", "172.00 Tshs", "10,000/=" and "10,000/-". All become a plain
 * number of shillings.
 */

/** A currency word. Used with the `i` flag. */
export const CUR = String.raw`(?:TZS|Tshs?|TSH)\.?`;

/** A number with optional thousands commas and cents. One capture group. */
export const NUM = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;

/** A number with a currency on either side, or a "/=" after it. Two capture groups. */
const WITH_CURRENCY = new RegExp(
  String.raw`${CUR}\s*${NUM}|${NUM}\s*(?:${CUR}(?![A-Za-z])|\/[=-])`,
  'gi',
);

/** §24's parseAmount, returning null for anything that is not a real amount. */
export function parseAmount(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = value
    .replace(/Tshs?|TSH|TZS/gi, '')
    .replace(/\/=|\/-/g, '')
    .replace(/[,\s]/g, '')
    .replace(/^\.+|\.+$/g, '')
    .trim();
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export interface FoundAmount {
  value: number;
  index: number;
}

/** Every amount written with a currency, in order. */
export function findCurrencyAmounts(text: string): FoundAmount[] {
  const found: FoundAmount[] = [];
  for (const m of text.matchAll(WITH_CURRENCY)) {
    const value = parseAmount(m[1] ?? m[2]);
    if (value != null) found.push({ value, index: m.index ?? 0 });
  }
  return found;
}

/** Words that make the amount after them a fee, tax or balance, not the transaction. */
const NOT_THE_AMOUNT =
  /(?:salio|balance|bal|ada|fee|fees|gharama|makato|vat|tozo|kodi|charges?|cost|levy)[^\d]{0,20}$/i;

/**
 * The first currency amount that is not a fee, tax or balance: the fallback
 * when no layout-specific pattern found the amount.
 */
export function firstTransactionAmount(text: string): number | null {
  for (const a of findCurrencyAmounts(text)) {
    const before = text.slice(Math.max(0, a.index - 30), a.index);
    if (!NOT_THE_AMOUNT.test(before)) return a.value;
  }
  return null;
}
