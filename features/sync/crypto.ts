/**
 * Locking records for sync, on the phone.
 *
 * Two keys are derived from the account key (see features/pin/crypto.ts):
 * - the record key locks each record with AES-256-GCM, bound to its account
 *   and its row, so the server cannot pass one row off as another;
 * - the fingerprint key turns a transaction ID into an HMAC the server can
 *   compare but not read, so two phones skip the same transaction.
 *
 * Pure functions: nonces are passed in.
 */
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import { fromBase64, toBase64 } from '../pin/bytes';

/** Which key locked a row. A new account key would come with a new version. */
export const KEY_VERSION = 1;

const RECORD_INFO = utf8ToBytes('PesaIQ-records-v1');
const FINGERPRINT_INFO = utf8ToBytes('PesaIQ-dedupe-v1');
const TAG_MESSAGE = utf8ToBytes('PesaIQ-key-tag-v1');

export interface SyncKeys {
  userId: string;
  recordKey: Uint8Array;
  fingerprintKey: Uint8Array;
}

export const syncKeys = (accountKey: Uint8Array, userId: string): SyncKeys => ({
  userId,
  recordKey: hkdf(sha256, accountKey, undefined, RECORD_INFO, 32),
  fingerprintKey: hkdf(sha256, accountKey, undefined, FINGERPRINT_INFO, 32),
});

/** Additional data: a locked record opens only as the account and row it was written for. */
const boundTo = (keys: SyncKeys, rowId: string) =>
  utf8ToBytes(`pesaiq-record:v1:${keys.userId}:${rowId}`);

export function sealRecord(
  keys: SyncKeys,
  rowId: string,
  plaintext: Uint8Array,
  nonce: Uint8Array,
): { ciphertext: string; nonce: string } {
  const sealed = gcm(keys.recordKey, nonce, boundTo(keys, rowId)).encrypt(plaintext);
  return { ciphertext: toBase64(sealed), nonce: toBase64(nonce) };
}

/** The record's bytes, or null when the key, account or row is not the one it was locked with. */
export function openRecord(
  keys: SyncKeys,
  rowId: string,
  ciphertext: string,
  nonce: string,
): Uint8Array | null {
  try {
    return gcm(keys.recordKey, fromBase64(nonce), boundTo(keys, rowId)).decrypt(
      fromBase64(ciphertext),
    );
  } catch {
    return null;
  }
}

/** The server's duplicate fingerprint for a transaction ID, or null without one. */
export const dedupeKeyOf = (keys: SyncKeys, transactionKey: string | null | undefined) =>
  transactionKey ? toBase64(hmac(sha256, keys.fingerprintKey, utf8ToBytes(transactionKey))) : null;

/** A short tag of the key, kept on the phone to notice when the account's key changes. */
export const keyTag = (keys: SyncKeys): string =>
  toBase64(hmac(sha256, keys.fingerprintKey, TAG_MESSAGE)).slice(0, 16);
