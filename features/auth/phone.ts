/**
 * Tanzanian mobile numbers, as people type them and as PesaIQ keeps them.
 *
 * People write the same number many ways: 0712 345 678, 712345678,
 * +255 712 345 678, 255712345678. PesaIQ keeps one form, 255 then nine digits
 * starting with 6 or 7: the rule the send-sms hook applies on the server too.
 */

/** 255 then nine digits, or null when the input is not a Tanzanian mobile. */
export function normalizeTzMobile(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('255')) digits = digits.slice(3);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^[67]\d{8}$/.test(digits) ? `255${digits}` : null;
}

/** "+255712345678": the form Supabase expects. */
export const toE164 = (normalized: string): string => `+${normalized.replace(/^\+/, '')}`;

/** "+255 712 345 678": a number shown back to its owner. */
export function formatTzMobile(normalized: string): string {
  const national = normalized.replace(/^\+?255/, '');
  return `+255 ${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`;
}

const WRONG_FORM = 'Enter a Tanzanian mobile number: 9 digits after +255, starting with 6 or 7.';

/** What stops a typed number from being used, or null when it can be. */
export function phoneProblem(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 0) return 'Enter your mobile number.';
  if (normalizeTzMobile(raw)) return null;

  const national = digits.replace(/^255/, '').replace(/^0/, '');
  if (!/^[67]/.test(national)) return WRONG_FORM;
  if (national.length < 9) return 'That number is too short: it needs 9 digits after +255.';
  return 'That number is too long: it needs 9 digits after +255.';
}
