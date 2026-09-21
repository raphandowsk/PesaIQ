/**
 * The app lock: the PIN is asked for each time PesaIQ is opened, and again
 * when it comes back after a while in the background.
 *
 * The PIN is checked on the phone, so the lock works offline. What is kept is
 * a verifier (an HMAC of the PIN under the account key), next to the account
 * key in secure storage: whoever could read it could read the key anyway, so
 * it gives nothing away. Wrong guesses are counted there too, and after five
 * the waits grow, as they do on the server.
 */
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import { FREE_TRIES } from './rules';

/** Back from the background after this long, the PIN is asked for again. */
export const AWAY_MS = 60_000;

/** The lock as this phone keeps it, per account. */
export interface LockRecord {
  /** base64 of `lockVerifier`. */
  verifier: string;
  failures: number;
  /** No guess is checked before this time (ISO), after too many wrong ones. */
  retryAt: string | null;
}

export interface LockRecords {
  get(userId: string): Promise<LockRecord | null>;
  set(userId: string, record: LockRecord): Promise<void>;
  remove(userId: string): Promise<void>;
}

const LOCK_INFO = 'pesaiq-app-lock:v1';

/** Fixed for the PIN, the account and its key; tells nothing without the key. */
export const lockVerifier = (accountKey: Uint8Array, userId: string, pin: string): Uint8Array =>
  hmac(sha256, accountKey, utf8ToBytes(`${LOCK_INFO}:${userId}:${pin}`));

/** The waits after the fifth, sixth, seventh and later wrong PINs. */
const WAITS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

/** How long to wait after `failures` wrong PINs in a row (0 while tries are free). */
export function lockWaitMs(failures: number): number {
  if (failures < FREE_TRIES) return 0;
  return WAITS_MS[Math.min(failures - FREE_TRIES, WAITS_MS.length - 1)];
}

/** Equal bytes, compared without stopping at the first difference. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Lock records in memory: for tests, and a fallback that forgets on restart. */
export function memoryLockRecords(): LockRecords {
  const map = new Map<string, LockRecord>();
  return {
    get: async (userId) => map.get(userId) ?? null,
    set: async (userId, record) => {
      map.set(userId, { ...record });
    },
    remove: async (userId) => {
      map.delete(userId);
    },
  };
}
