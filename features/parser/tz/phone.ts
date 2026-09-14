/**
 * Tanzanian phone numbers (§25). Normalized to +255 internally, then masked:
 * the app keeps only the masked form, so a full number never reaches the
 * database, a log or an export.
 */
import { maskIdentifier } from '../extractors';

/** A Tanzanian mobile number however it is written: 07.., 06.., 255.., +255 7.. .. .. */
export const PHONE = String.raw`(?:\+?255\s?|\b0)[67]\d{2}\s?\d{3}\s?\d{3}\b`;

/** §25's normalizeTzPhone. */
export function normalizeTzPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('255') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+255${digits.substring(1)}`;
  if (digits.length === 9) return `+255${digits}`;
  return null;
}

/** "07** *** 678". Null for anything that is not a Tanzanian number. */
export function maskTzPhone(phone: string): string | null {
  const normalized = normalizeTzPhone(phone);
  return normalized ? maskIdentifier(normalized) : null;
}

/** A till, account or control number: only its last four digits. */
export function maskNumber(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return maskTzPhone(digits) ?? maskIdentifier(digits);
}
