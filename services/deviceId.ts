/**
 * This phone's row id in the signed-in phones list, one per account, made on
 * first use and kept on the phone. Not a secret: it only names the row.
 */
import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { DeviceIds } from '../features/devices/store';

const keyName = (userId: string) => `pesaiq.device-id.${userId}`;

const read = async (name: string): Promise<string | null> =>
  Platform.OS === 'web'
    ? (globalThis.localStorage?.getItem(name) ?? null)
    : SecureStore.getItemAsync(name);

const write = async (name: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(name, value);
  else await SecureStore.setItemAsync(name, value);
};

export const deviceIds: DeviceIds = {
  async idFor(userId) {
    const name = keyName(userId);
    const known = await read(name);
    if (known) return known;
    const id = randomUUID();
    await write(name, id);
    return id;
  },
};
