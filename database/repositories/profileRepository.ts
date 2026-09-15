/**
 * The user's optional name, kept as text in the settings table.
 *
 * Removing it keeps the row, empty and dated, so the removal syncs to the
 * account's other phones like any other change (syncRepository.readPreferences).
 * No row at all means a name was never set on this phone.
 */
import type { NameEntry } from '../../features/sync/preferences';
import type { SqlDatabase } from '../client';

const NAME_KEY = 'displayName';

export const profileRepository = {
  /** The name and when it was last set or removed; null if it never was. */
  async getName(db: SqlDatabase): Promise<NameEntry | null> {
    const row = await db.getFirstAsync<{ value: string; updated_at: string }>(
      'SELECT value, updated_at FROM settings WHERE key = ?',
      [NAME_KEY],
    );
    return row ? { name: row.value || null, at: row.updated_at } : null;
  },

  /** Null removes the name. `at` is when the change was made, on whichever phone. */
  async setName(db: SqlDatabase, name: string | null, at: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [NAME_KEY, name ?? '', at],
    );
  },
};
