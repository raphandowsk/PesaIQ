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

/**
 * A LUKU token, written in groups of four ("1111 2222 3333 4444 5555"). Its
 * groups are too short for LONG_NUMBER, and until it is entered it is as good
 * as money, so it is hidden like a phone number.
 */
const TOKEN = /\b\d{4}(?:[ -]\d{4}){4}\b/g;

export function maskIdentifiersInText(text: string): string {
  return text
    .replace(TOKEN, (token) => `**** **** **** **** ${token.replace(/\D/g, '').slice(-4)}`)
    .replace(LONG_NUMBER, maskNumber);
}
