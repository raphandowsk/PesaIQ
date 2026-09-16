import type { SqlDatabase } from '../database/client';
import { categoryRuleRepository, syncRepository } from '../database/repositories';
import { useAppStore } from '../features/transactions/store';
import { TZ } from './fixtures/tz-messages';
import { createMigratedDatabase } from './support/nodeSqlite';

// Invented name and recipient; the message is an anonymized fixture.
const NOW = '2026-09-16T09:00:00.000Z';

const count = async (db: SqlDatabase, table: string, where = '') =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`))!.n;

describe('erasing this phone after Delete account', () => {
  let db: SqlDatabase;

  beforeEach(async () => {
    db = await createMigratedDatabase();
    await useAppStore.getState().initialize({ database: db, now: () => NOW });
  });
  afterEach(() => db.closeAsync());

  it('leaves the phone as a fresh install would be', async () => {
    const app = useAppStore.getState();
    await app.analyzeAndSave(TZ.mixxToOtherNetwork);
    await app.setDisplayName('Asha');
    await app.completeOnboarding();
    await categoryRuleRepository.set(db, 'neema ally omari', 'OTHER_SPENDING', NOW);
    await syncRepository.setState(db, 'account', '5b0c1f7e-0000-4000-8000-000000000001');
    expect(await count(db, 'transactions', 'WHERE is_demo = 0')).toBe(1);

    await useAppStore.getState().eraseThisPhone();

    for (const table of [
      'category_rules',
      'category_rule_deletions',
      'sync_state',
      'sync_deletions',
      'processing_events',
      'parse_results',
    ]) {
      expect({ table, rows: await count(db, table) }).toEqual({ table, rows: 0 });
    }
    expect(await count(db, 'transactions', 'WHERE is_demo = 0')).toBe(0);
    expect(await count(db, 'messages', 'WHERE is_demo = 0')).toBe(0);

    const after = useAppStore.getState();
    expect(after.displayName).toBeNull();
    expect(after.settings.onboardingComplete).toBe(false);
    expect(after.categoryRules).toEqual({});
    expect(after.activity).toEqual([]);
    expect(after.transactions.every((t) => t.isDemo)).toBe(true);
    // The provider registry is back, as on a first launch.
    expect(after.providers.length).toBeGreaterThanOrEqual(12);
  });
});
