/**
 * Provider registry persistence.
 *
 * Maturity is stored rather than derived so a provider can be promoted past
 * DEMO by a migration once anonymized fixtures prove its rules, without
 * shipping new code.
 */
import { PROVIDERS, type SmsProvider } from '../../features/parser';
import type { SqlDatabase } from '../client';

interface ProviderRow {
  id: string;
  name: string;
  country: string;
  enabled: number;
  maturity: string;
}

const toProvider = (row: ProviderRow): SmsProvider => ({
  id: row.id,
  name: row.name,
  country: row.country,
  enabled: row.enabled === 1,
  maturity: row.maturity as SmsProvider['maturity'],
});

export const providerRepository = {
  /** Idempotent: safe to run on every launch. */
  async seed(db: SqlDatabase): Promise<void> {
    for (const p of PROVIDERS) {
      await db.runAsync(
        `INSERT INTO providers (id, name, country, enabled, maturity) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        [p.id, p.name, p.country, p.enabled ? 1 : 0, p.maturity],
      );
    }
  },

  async list(db: SqlDatabase): Promise<SmsProvider[]> {
    const rows = await db.getAllAsync<ProviderRow>('SELECT * FROM providers ORDER BY name');
    return rows.map(toProvider);
  },

  async setEnabled(db: SqlDatabase, id: string, enabled: boolean): Promise<void> {
    await db.runAsync('UPDATE providers SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  },
};
