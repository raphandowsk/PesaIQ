/**
 * The account key on this phone: in secure storage, readable only while the
 * phone is unlocked, and never copied to a backup or another device. Kept per
 * account, so another person signing in on the phone cannot use it.
 *
 * The web preview has no secure storage and keeps it in the browser instead;
 * it is a development tool, not a place for real records.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { fromBase64, toBase64 } from '../features/pin/bytes';
import type { LockRecord, LockRecords } from '../features/pin/lock';
import type { LocalKeys } from '../features/pin/store';

const keyName = (userId: string) => `pesaiq.account-key.${userId}`;

const browser: LocalKeys = {
  async get(userId) {
    const value = globalThis.localStorage?.getItem(keyName(userId));
    return value ? fromBase64(value) : null;
  },
  async set(userId, key) {
    globalThis.localStorage?.setItem(keyName(userId), toBase64(key));
  },
  async remove(userId) {
    globalThis.localStorage?.removeItem(keyName(userId));
  },
};

const phone: LocalKeys = {
  async get(userId) {
    const value = await SecureStore.getItemAsync(keyName(userId));
    return value ? fromBase64(value) : null;
  },
  async set(userId, key) {
    await SecureStore.setItemAsync(keyName(userId), toBase64(key), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },
  async remove(userId) {
    await SecureStore.deleteItemAsync(keyName(userId));
  },
};

export const localKeys: LocalKeys = Platform.OS === 'web' ? browser : phone;

const lockName = (userId: string) => `pesaiq.app-lock.${userId}`;

const parseLock = (value: string | null): LockRecord | null => {
  if (!value) return null;
  const parsed = JSON.parse(value) as Partial<LockRecord>;
  if (typeof parsed.verifier !== 'string') return null;
  return {
    verifier: parsed.verifier,
    failures: typeof parsed.failures === 'number' ? parsed.failures : 0,
    retryAt: typeof parsed.retryAt === 'string' ? parsed.retryAt : null,
  };
};

/** The app lock's PIN verifier and guess count, kept beside the account key. */
export const lockRecords: LockRecords =
  Platform.OS === 'web'
    ? {
        async get(userId) {
          return parseLock(globalThis.localStorage?.getItem(lockName(userId)) ?? null);
        },
        async set(userId, record) {
          globalThis.localStorage?.setItem(lockName(userId), JSON.stringify(record));
        },
        async remove(userId) {
          globalThis.localStorage?.removeItem(lockName(userId));
        },
      }
    : {
        async get(userId) {
          return parseLock(await SecureStore.getItemAsync(lockName(userId)));
        },
        async set(userId, record) {
          await SecureStore.setItemAsync(lockName(userId), JSON.stringify(record), {
            keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
          });
        },
        async remove(userId) {
          await SecureStore.deleteItemAsync(lockName(userId));
        },
      };
