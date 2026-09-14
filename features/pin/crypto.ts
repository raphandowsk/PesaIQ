/**
 * The PIN's cryptography, on the phone.
 *
 * 1. The PIN is hashed to a point on ristretto255 and blinded by a random
 *    number, so what is sent reveals nothing about it.
 * 2. The pin-oprf Edge Function counts the guess and multiplies the point by
 *    its per-user secret. The phone removes the blind and hashes the result:
 *    a strong key that exists only for the right PIN and the server's secret.
 * 3. That key (through HKDF) locks the account key with AES-256-GCM. Only the
 *    locked account key is stored on the server.
 *
 * The account key is 32 random bytes made on the phone; it will lock the
 * records that sync. A verifier (an HMAC under the account key) lets the
 * server reset the guess count after a correct PIN without learning anything.
 *
 * Pure functions: randomness is passed in, so tests are deterministic.
 */
import { invert, mod } from '@noble/curves/abstract/modular';
import { hashToRistretto255, ristretto255 } from '@noble/curves/ed25519';
import { bytesToNumberLE } from '@noble/curves/utils';
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils';

const Point = ristretto255.Point;
const ORDER = Point.Fn.ORDER;

const HASH_DST = utf8ToBytes('PesaIQ-PIN-OPRF-ristretto255-SHA512-v1');
const FINALIZE = utf8ToBytes('PesaIQ-PIN-finalize-v1');
const WRAP_INFO = utf8ToBytes('PesaIQ-account-key-wrap-v1');
const VERIFIER_INFO = utf8ToBytes('PesaIQ-PIN-verifier-v1');

export type Random = (byteCount: number) => Uint8Array;

/** What is hashed: bound to the account, so the same PIN differs per person. */
export const pinInput = (userId: string, pin: string): Uint8Array =>
  utf8ToBytes(`pesaiq-pin:v1:${userId}:${pin}`);

/** A random scalar in [1, order). */
export function randomScalar(random: Random): bigint {
  for (;;) {
    const s = mod(bytesToNumberLE(random(64)), ORDER);
    if (s !== BigInt(0)) return s;
  }
}

/** The blinded PIN to send. */
export function blindPin(input: Uint8Array, blind: bigint): Uint8Array {
  return hashToRistretto255(input, { DST: HASH_DST }).multiply(blind).toBytes();
}

const lengthPrefixed = (bytes: Uint8Array) =>
  concatBytes(new Uint8Array([bytes.length >> 8, bytes.length & 0xff]), bytes);

/** The server's answer, unblinded and hashed: 64 bytes known only with the right PIN. */
export function finishPin(input: Uint8Array, blind: bigint, evaluated: Uint8Array): Uint8Array {
  const answer = Point.fromBytes(evaluated);
  if (answer.is0()) throw new Error('Empty evaluation');
  const unblinded = answer.multiply(invert(blind, ORDER));
  return sha512(concatBytes(lengthPrefixed(input), lengthPrefixed(unblinded.toBytes()), FINALIZE));
}

/** The key that locks the account key. */
export const wrappingKey = (pinSecret: Uint8Array, salt: Uint8Array): Uint8Array =>
  hkdf(sha256, pinSecret, salt, WRAP_INFO, 32);

export const sealAccountKey = (
  accountKey: Uint8Array,
  wrapKey: Uint8Array,
  nonce: Uint8Array,
  userId: string,
): Uint8Array => gcm(wrapKey, nonce, utf8ToBytes(userId)).encrypt(accountKey);

/** The account key, or null when the PIN (so the wrapping key) is wrong. */
export function openAccountKey(
  sealed: Uint8Array,
  wrapKey: Uint8Array,
  nonce: Uint8Array,
  userId: string,
): Uint8Array | null {
  try {
    return gcm(wrapKey, nonce, utf8ToBytes(userId)).decrypt(sealed);
  } catch {
    return null;
  }
}

export const pinVerifier = (accountKey: Uint8Array): Uint8Array =>
  hmac(sha256, accountKey, VERIFIER_INFO);
