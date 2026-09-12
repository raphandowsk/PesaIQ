import { LATEST_VERSION, MIGRATIONS, migrate } from '../database/migrations';
import { providerRepository, transactionRepository } from '../database/repositories';
import { EMPTY_DETAILS } from '../features/parser/schema';
import { createTestDatabase } from './support/nodeSqlite';

/**
 * An installed app upgrades a database it created earlier. Build one exactly as
 * version 1 left it, with a record in it, and upgrade.
 */
describe('upgrading a version 1 database', () => {
  it('adds fees, taxes and categories without losing a record', async () => {
    const db = createTestDatabase();
    await db.execAsync('PRAGMA foreign_keys = ON');
    await db.execAsync(MIGRATIONS[0].up);
    await db.execAsync('PRAGMA user_version = 1');

    await db.runAsync(
      `INSERT INTO providers (id, name, country, enabled, maturity) VALUES ('mixx', 'Mixx by Yas', 'TZ', 1, 'DEMO')`,
    );
    await db.runAsync(
      `INSERT INTO transactions (id, type, status, amount, currency, confidence, low_fields, is_demo, created_at, updated_at)
       VALUES ('old', 'SENT', 'CONFIRMED', 45000, 'TZS', 0.9, '[]', 0, '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z')`,
    );

    await expect(migrate(db)).resolves.toBe(LATEST_VERSION);

    const old = await transactionRepository.findById(db, 'old');
    expect(old).toMatchObject({
      amount: 45000,
      moneyCategory: null,
      fee: null,
      taxes: [],
      details: EMPTY_DETAILS,
    });

    const providers = await providerRepository.list(db);
    expect(providers.find((p) => p.id === 'mixx')?.maturity).toBe('EXPERIMENTAL');

    await expect(db.getAllAsync('SELECT * FROM category_rules')).resolves.toEqual([]);
    await db.closeAsync();
  });
});
