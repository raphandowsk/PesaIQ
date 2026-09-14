/**
 * The PIN and the account key it unlocks.
 *
 * After signing in, a phone either has the account key already (kept in its
 * secure storage), or the account has a key on the server to unlock with the
 * PIN, or the account has none yet and a PIN is created. The store talks to
 * the server through `PinApi` (Supabase in the app, a fake in tests) and keeps
 * the key on the phone through `LocalKeys`.
 */
import { create } from 'zustand';

import { fromBase64, toBase64 } from './bytes';
import {
  blindPin,
  finishPin,
  openAccountKey,
  pinInput,
  pinVerifier,
  randomScalar,
  sealAccountKey,
  wrappingKey,
  type Random,
} from './crypto';
import { pinProblem, retryText, triesLeft } from './rules';

export type PinStatus = 'idle' | 'checking' | 'needsCreate' | 'needsUnlock' | 'ready' | 'offline';

/** The locked account key as the server holds it (base64). */
export interface KeyRecord {
  wrappedKey: string;
  nonce: string;
  salt: string;
}

export type Evaluation =
  | { kind: 'evaluated'; evaluated: Uint8Array; failures: number }
  | { kind: 'locked'; retryAt: string; failures: number }
  | { kind: 'failed'; message: string };

/** The server side of the PIN. Methods other than `evaluate` throw on failure. */
export interface PinApi {
  fetchKey(): Promise<KeyRecord | null>;
  /** Adds the account's key; fails if it already has one. */
  saveKey(record: KeyRecord): Promise<void>;
  evaluate(blinded: Uint8Array): Promise<Evaluation>;
  confirm(verifier: Uint8Array): Promise<boolean>;
  /** Deletes everything synced to the account, so a new PIN can be set. */
  startOver(): Promise<void>;
}

/** The account key on this phone, by account. */
export interface LocalKeys {
  get(userId: string): Promise<Uint8Array | null>;
  set(userId: string, key: Uint8Array): Promise<void>;
  remove(userId: string): Promise<void>;
}

export type PinResult = { ok: true } | { ok: false; message: string; retryAt?: string };

export const PIN_MESSAGES = {
  offline: "Couldn't reach PesaIQ. Check your connection and try again.",
  failed: 'Something went wrong. Please try again.',
  enterPin: 'Enter your 4-digit PIN.',
} as const;

export interface PinState {
  status: PinStatus;
  userId: string | null;
  /** The unlocked account key, in memory while signed in. */
  accountKey: Uint8Array | null;
  record: KeyRecord | null;
  check(userId: string): Promise<void>;
  create(pin: string): Promise<PinResult>;
  unlock(pin: string): Promise<PinResult>;
  startOver(): Promise<PinResult>;
  /** Removes this phone's copy of the key (sign-out) and clears the state. */
  forget(userId?: string): Promise<void>;
  /** Clears the state only (signed out elsewhere). */
  reset(): void;
}

const wrongPin = (failures: number) => {
  const left = triesLeft(failures);
  return left > 0
    ? `That PIN isn't right. ${left} ${left === 1 ? 'try' : 'tries'} left before a wait.`
    : "That PIN isn't right. You'll need to wait before the next try.";
};

export function createPinStore(
  api: PinApi | null,
  local: LocalKeys,
  random: Random,
  now: () => number = Date.now,
) {
  const evaluate = async (blinded: Uint8Array): Promise<Evaluation> => {
    if (!api) return { kind: 'failed', message: PIN_MESSAGES.offline };
    try {
      return await api.evaluate(blinded);
    } catch {
      return { kind: 'failed', message: PIN_MESSAGES.offline };
    }
  };

  const refused = (evaluation: Exclude<Evaluation, { kind: 'evaluated' }>): PinResult =>
    evaluation.kind === 'locked'
      ? {
          ok: false,
          message: `Too many tries. ${retryText(evaluation.retryAt, now())}`,
          retryAt: evaluation.retryAt,
        }
      : { ok: false, message: evaluation.message };

  const keepOnPhone = async (userId: string, key: Uint8Array) => {
    try {
      await local.set(userId, key);
    } catch {
      // Not kept: the PIN is asked for again next launch. Nothing is lost.
    }
  };

  return create<PinState>()((set, get) => ({
    status: 'idle',
    userId: null,
    accountKey: null,
    record: null,

    async check(userId) {
      set({ status: 'checking', userId, accountKey: null, record: null });
      try {
        const kept = await local.get(userId);
        if (kept) {
          set({ status: 'ready', accountKey: kept });
          return;
        }
      } catch {
        // Unreadable: ask the server instead.
      }
      if (!api) {
        set({ status: 'offline' });
        return;
      }
      try {
        const record = await api.fetchKey();
        set({ status: record ? 'needsUnlock' : 'needsCreate', record });
      } catch {
        set({ status: 'offline' });
      }
    },

    async create(pin) {
      const { userId, status } = get();
      if (!api || !userId || status !== 'needsCreate')
        return { ok: false, message: PIN_MESSAGES.failed };
      const problem = pinProblem(pin);
      if (problem) return { ok: false, message: problem };

      const input = pinInput(userId, pin);
      const blind = randomScalar(random);
      const evaluation = await evaluate(blindPin(input, blind));
      if (evaluation.kind !== 'evaluated') return refused(evaluation);

      let secret: Uint8Array;
      try {
        secret = finishPin(input, blind, evaluation.evaluated);
      } catch {
        return { ok: false, message: PIN_MESSAGES.failed };
      }
      const accountKey = random(32);
      const salt = random(16);
      const nonce = random(12);
      const sealed = sealAccountKey(accountKey, wrappingKey(secret, salt), nonce, userId);
      const record: KeyRecord = {
        wrappedKey: toBase64(sealed),
        nonce: toBase64(nonce),
        salt: toBase64(salt),
      };

      try {
        await api.saveKey(record);
        await api.confirm(pinVerifier(accountKey));
      } catch {
        return { ok: false, message: PIN_MESSAGES.offline };
      }
      await keepOnPhone(userId, accountKey);
      set({ status: 'ready', accountKey, record });
      return { ok: true };
    },

    async unlock(pin) {
      const { userId, record, status } = get();
      if (!api || !userId || !record || status !== 'needsUnlock') {
        return { ok: false, message: PIN_MESSAGES.failed };
      }
      if (!/^\d{4}$/.test(pin)) return { ok: false, message: PIN_MESSAGES.enterPin };

      const input = pinInput(userId, pin);
      const blind = randomScalar(random);
      const evaluation = await evaluate(blindPin(input, blind));
      if (evaluation.kind !== 'evaluated') return refused(evaluation);

      let accountKey: Uint8Array | null = null;
      try {
        const secret = finishPin(input, blind, evaluation.evaluated);
        accountKey = openAccountKey(
          fromBase64(record.wrappedKey),
          wrappingKey(secret, fromBase64(record.salt)),
          fromBase64(record.nonce),
          userId,
        );
      } catch {
        return { ok: false, message: PIN_MESSAGES.failed };
      }
      if (!accountKey) return { ok: false, message: wrongPin(evaluation.failures) };

      try {
        await api.confirm(pinVerifier(accountKey));
      } catch {
        // The count resets on the next correct PIN; the key is already open.
      }
      await keepOnPhone(userId, accountKey);
      set({ status: 'ready', accountKey });
      return { ok: true };
    },

    async startOver() {
      if (!api || !get().userId) return { ok: false, message: PIN_MESSAGES.failed };
      try {
        await api.startOver();
      } catch {
        return { ok: false, message: PIN_MESSAGES.offline };
      }
      set({ status: 'needsCreate', record: null, accountKey: null });
      return { ok: true };
    },

    async forget(userId = get().userId ?? undefined) {
      if (userId) {
        try {
          await local.remove(userId);
        } catch {
          // Nothing kept, or unreadable: either way it is not used again.
        }
      }
      set({ status: 'idle', userId: null, accountKey: null, record: null });
    },

    reset() {
      set({ status: 'idle', userId: null, accountKey: null, record: null });
    },
  }));
}
