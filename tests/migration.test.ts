import { LATEST_VERSION, MIGRATIONS, migrate } from '../database/migrations';
import { providerRepository, transactionRepository } from '../database/repositories';
import { EMPTY_DETAILS } from '../features/parser/schema';
import { messageKey } from '../features/transactions/transactionKey';
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

describe('upgrading a version 2 database', () => {
  it('gives each record its transaction ID and marks later copies, keeping them all', async () => {
    const db = createTestDatabase();
    await db.execAsync('PRAGMA foreign_keys = ON');
    await db.execAsync(MIGRATIONS[0].up);
    await db.execAsync(MIGRATIONS[1].up);
    await db.execAsync('PRAGMA user_version = 2');

    await db.runAsync(
      `INSERT INTO providers (id, name, country, enabled, maturity) VALUES ('mixx', 'Mixx by Yas', 'TZ', 1, 'EXPERIMENTAL')`,
    );
    // Invented text. The second copy differs only in case and spacing.
    const text = 'You have received TZS 7,000 from JANE DOE.';
    const messages: [string, string][] = [
      ['m1', text],
      ['m2', `  ${text.toUpperCase().replace(' FROM', '\nFROM')}  `],
    ];
    for (const [id, body] of messages) {
      await db.runAsync(
        `INSERT INTO messages (id, original_text, normalized_text, received_at, created_at)
         VALUES (?, ?, ?, '2026-03-01T00:00:00Z', '2026-03-01T00:00:00Z')`,
        [id, body, body],
      );
    }

    // id, provider, reference, message, demo, saved on
    const rows: [string, string | null, string | null, string | null, number, string][] = [
      ['a', 'mixx', 'QH42T8LM9P', null, 0, '2026-03-01'],
      ['b', 'mixx', 'qh42-t8lm9p', null, 0, '2026-03-02'],
      ['c', 'mixx', 'QH42T8LM9P', null, 0, '2026-03-03'],
      ['d', 'mixx', 'QH42T8LM9P', null, 1, '2026-02-01'],
      ['e', null, null, 'm1', 0, '2026-03-04'],
      ['f', null, null, 'm2', 0, '2026-03-05'],
    ];
    for (const [id, provider, reference, message, demo, at] of rows) {
      await db.runAsync(
        `INSERT INTO transactions (id, type, status, provider_id, transaction_reference, source_message_id,
           amount, currency, confidence, low_fields, is_demo, created_at, updated_at)
         VALUES (?, 'SENT', 'CONFIRMED', ?, ?, ?, 45000, 'TZS', 0.9, '[]', ?, ?, ?)`,
        [id, provider, reference, message, demo, at, at],
      );
    }

    await expect(migrate(db)).resolves.toBe(LATEST_VERSION);

    const ref = 'ref:mixx:QH42T8LM9P';
    await expect(
      db.getAllAsync('SELECT id, transaction_key, duplicate_of FROM transactions ORDER BY id'),
    ).resolves.toEqual([
      { id: 'a', transaction_key: ref, duplicate_of: null },
      { id: 'b', transaction_key: null, duplicate_of: 'a' },
      { id: 'c', transaction_key: null, duplicate_of: 'a' },
      // Demo samples keep an ID but never count as the earlier record.
      { id: 'd', transaction_key: ref, duplicate_of: null },
      { id: 'e', transaction_key: messageKey(text), duplicate_of: null },
      { id: 'f', transaction_key: null, duplicate_of: 'e' },
    ]);

    // From here on the database itself refuses a second real record with that ID.
    await expect(
      transactionRepository.update(db, 'b', { transactionKey: ref }, '2026-09-14T00:00:00Z'),
    ).rejects.toThrow(/UNIQUE/);
    await db.closeAsync();
  });
});
