/**
 * A transaction's ID: what tells the same transaction apart from a new one.
 *
 * - With a reference: the provider and the reference, ignoring case, spaces
 *   and punctuation ("ref:mixx:QH42T8LM9P"). The same reference from two
 *   providers is two transactions.
 * - Without one: a fingerprint of the message text ("msg:…"), so the same SMS
 *   pasted twice is still caught.
 *
 * Sync will build on it: the server gets only a keyed fingerprint of this ID.
 */
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

export interface KeyParts {
  provider: string | null;
  providerId?: string | null;
  transactionReference: string | null;
}

/** Shorter than this, a "reference" is more likely a stray number than an ID. */
export const MIN_REFERENCE_LENGTH = 4;

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** "ref:<provider>:<REFERENCE>", or null without a usable reference. */
export function referenceKey(parts: KeyParts): string | null {
  const reference = (parts.transactionReference ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (reference.length < MIN_REFERENCE_LENGTH) return null;
  const provider = slug(parts.providerId ?? '') || slug(parts.provider ?? '') || 'unknown';
  return `ref:${provider}:${reference}`;
}

/** "msg:<fingerprint>" of the message text, ignoring case and spacing. */
export function messageKey(text: string | null | undefined): string | null {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!clean) return null;
  return `msg:${bytesToHex(sha256(utf8ToBytes(clean))).slice(0, 32)}`;
}

/** The reference key when there is a reference, the message fingerprint otherwise. */
export const transactionKey = (parts: KeyParts, messageText?: string | null): string | null =>
  referenceKey(parts) ?? messageKey(messageText);
