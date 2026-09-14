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
