/**
 * Settings persistence — a typed key/value store.
 *
 * The defaults below are the privacy posture the app promises: automatic
 * processing, AI fallback and cloud sync are all OFF, and nothing turns them on
 * except the user. See docs/PRIVACY.md.
 */
import type { SqlDatabase } from '../client';

export interface AppSettings {
  /** Stage 1 has no automatic processing; the toggle exists for Stage 2. */
  automaticProcessing: boolean;
  /** Off by default. No AI provider is wired in Stage 1. */
  aiFallback: boolean;
  /** Off by default. On: encrypted records sync with the account (features/sync). */
  cloudSync: boolean;
  /** Whether generated sample records are present. */
  demoDataEnabled: boolean;
  onboardingComplete: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  automaticProcessing: false,
  aiFallback: false,
  cloudSync: false,
  demoDataEnabled: true,
  onboardingComplete: false,
};

type SettingKey = keyof AppSettings;

const encode = (v: boolean): string => (v ? '1' : '0');
const decode = (v: string): boolean => v === '1';

export const settingsRepository = {
  async getAll(db: SqlDatabase): Promise<AppSettings> {
    const rows = await db.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings',
    );

    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const result = { ...DEFAULT_SETTINGS };

    for (const key of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      if (key in stored) result[key] = decode(stored[key]);
    }

    return result;
  },

  async get(db: SqlDatabase, key: SettingKey): Promise<boolean> {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key],
    );
    return row ? decode(row.value) : DEFAULT_SETTINGS[key];
  },

  async set(db: SqlDatabase, key: SettingKey, value: boolean, now: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, encode(value), now],
    );
  },

  async reset(db: SqlDatabase): Promise<void> {
    await db.runAsync('DELETE FROM settings');
  },
};
