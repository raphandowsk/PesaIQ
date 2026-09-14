/**
 * The sign-in session, kept in the phone's secure storage (the iPhone
 * Keychain; Android's Keystore-backed storage).
 *
 * Secure storage refuses values over 2048 bytes on some iPhones, and a session
 * is often larger. So each value is split into numbered chunks, with the count
 * under `<key>.n`. The count is written last and removed first, so an
 * interrupted write reads as "signed out" rather than as a broken session.
 */

/** The three calls PesaIQ uses from expo-secure-store. */
export interface SecureKV {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** The storage shape Supabase's client accepts. */
export interface SessionStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** Characters per chunk. A session is ASCII JSON, so this stays under 2048 bytes. */
export const CHUNK_SIZE = 1800;

export function chunkedStorage(kv: SecureKV, chunkSize = CHUNK_SIZE): SessionStorage {
  const countKey = (key: string) => `${key}.n`;
  const chunkKey = (key: string, i: number) => `${key}.${i}`;

  const readCount = async (key: string): Promise<number | null> => {
    const raw = await kv.getItemAsync(countKey(key));
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  };

  const removeItem = async (key: string) => {
    const n = (await readCount(key)) ?? 0;
    await kv.deleteItemAsync(countKey(key));
    for (let i = 0; i < n; i++) await kv.deleteItemAsync(chunkKey(key, i));
  };

  return {
    async getItem(key) {
      const n = await readCount(key);
      if (n == null) return null;
      const parts: string[] = [];
      for (let i = 0; i < n; i++) {
        const part = await kv.getItemAsync(chunkKey(key, i));
        if (part == null) return null;
        parts.push(part);
      }
      return parts.join('');
    },

    async setItem(key, value) {
      await removeItem(key);
      const parts: string[] = [];
      for (let i = 0; i < value.length; i += chunkSize) parts.push(value.slice(i, i + chunkSize));
      for (let i = 0; i < parts.length; i++) await kv.setItemAsync(chunkKey(key, i), parts[i]);
      await kv.setItemAsync(countKey(key), String(parts.length));
    },

    removeItem,
  };
}
