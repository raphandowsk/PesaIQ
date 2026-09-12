/**
 * Masking identifiers inside free text, for display.
 *
 * Source messages are stored exactly as pasted, because the parser needs them
 * intact, but a full phone or account number is never shown unless the user
 * asks for it. The formats match the extractor's own masking (07** *** 678,
 * **** 1234), so a masked message reads like the record beside it.
 */

/**
 * Nine or more digits in a row: a phone or account number. Amounts are
 * written with separators ("250,000.00") and references mix letters in
 * ("QH42T8LM9P", "BK7741902"), so neither is caught.
 */
const LONG_NUMBER = /\+?\d{9,}/g;

export function maskNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (/^0\d{9}$/.test(digits)) return `${digits.slice(0, 2)}** *** ${digits.slice(-3)}`;
  if (/^255\d{9}$/.test(digits)) return `+255 ${digits.slice(3, 4)}** *** ${digits.slice(-3)}`;
  return `**** ${digits.slice(-4)}`;
}

export function maskIdentifiersInText(text: string): string {
  return text.replace(LONG_NUMBER, maskNumber);
}
