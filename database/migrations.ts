/**
 * Schema migrations.
 *
 * Versioned with SQLite's own `user_version` pragma rather than a table we
 * maintain. Each migration is applied once, in order, inside a transaction.
 *
 * Never edit a migration that has shipped — add another one. An installed app
 * has already run the old version and will not run it again.
 */
import { transactionKey } from '../features/transactions/transactionKey';
import type { SqlDatabase } from './client';

export interface Migration {
  version: number;
  name: string;
  up: string;
  /** Work SQL alone can't do (hashing, say), run after `up` in the same transaction. */
  after?: (db: SqlDatabase) => Promise<void>;
}

/**
 * Give every record its transaction ID. Records are visited oldest first; a
 * real record repeating an earlier one keeps no ID and points at the earlier
 * record instead, for the user to review. Demo samples get an ID but never
 * count as the earlier record.
 */
async function backfillTransactionKeys(db: SqlDatabase): Promise<void> {
  const rows = await db.getAllAsync<{
    id: string;
    provider: string | null;
    provider_id: string | null;
    transaction_reference: string | null;
    is_demo: number;
    normalized_text: string | null;
  }>(
    `SELECT t.id, t.provider, t.provider_id, t.transaction_reference, t.is_demo, m.normalized_text
       FROM transactions t LEFT JOIN messages m ON m.id = t.source_message_id
      ORDER BY t.created_at ASC, t.id ASC`,
  );

  const firstWithKey = new Map<string, string>();
  for (const row of rows) {
    const key = transactionKey(
      {
        provider: row.provider,
        providerId: row.provider_id,
        transactionReference: row.transaction_reference,
      },
      row.normalized_text,
    );
    if (!key) continue;

    const earlier = row.is_demo === 1 ? undefined : firstWithKey.get(key);
    if (earlier) {
      await db.runAsync('UPDATE transactions SET duplicate_of = ? WHERE id = ?', [earlier, row.id]);
      continue;
    }
    if (row.is_demo !== 1) firstWithKey.set(key, row.id);
    await db.runAsync('UPDATE transactions SET transaction_key = ? WHERE id = ?', [key, row.id]);
  }
}

/** Exported so a test can build a database as an older version left it. */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up: `
      -- Source messages. Retained so a parse can be re-explained and so rules
      -- can be re-run after a change. See docs/PRIVACY.md: this is the most
      -- sensitive thing stored, and Settings can delete all of it.
      CREATE TABLE messages (
        id             TEXT PRIMARY KEY NOT NULL,
        original_text  TEXT NOT NULL,
        normalized_text TEXT NOT NULL,
        sender         TEXT,
        received_at    TEXT NOT NULL,
        source         TEXT NOT NULL DEFAULT 'MANUAL',
        is_demo        INTEGER NOT NULL DEFAULT 0,
        created_at     TEXT NOT NULL
      );

      -- One row per parse attempt. Keeps the confidence breakdown and the
      -- reasons so "How we got this" can be rendered later, not just now.
      CREATE TABLE parse_results (
        id            TEXT PRIMARY KEY NOT NULL,
        message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        parser_id     TEXT NOT NULL,
        category      TEXT NOT NULL,
        type          TEXT NOT NULL,
        confidence    REAL NOT NULL,
        band          TEXT NOT NULL,
        payload       TEXT NOT NULL,
        created_at    TEXT NOT NULL
      );
      CREATE INDEX idx_parse_results_message ON parse_results(message_id);

      -- The records the user actually sees. Identifiers are stored masked.
      CREATE TABLE transactions (
        id                      TEXT PRIMARY KEY NOT NULL,
        type                    TEXT NOT NULL,
        status                  TEXT NOT NULL,
        provider                TEXT,
        provider_id             TEXT,
        amount                  REAL,
        currency                TEXT,
        counterparty            TEXT,
        masked_account_or_phone TEXT,
        transaction_reference   TEXT,
        balance_after           REAL,
        transaction_date        TEXT,
        transaction_time        TEXT,
        confidence              REAL NOT NULL,
        low_fields              TEXT NOT NULL DEFAULT '[]',
        source_message_id       TEXT REFERENCES messages(id) ON DELETE SET NULL,
        parse_result_id         TEXT REFERENCES parse_results(id) ON DELETE SET NULL,
        is_demo                 INTEGER NOT NULL DEFAULT 0,
        created_at              TEXT NOT NULL,
        updated_at              TEXT NOT NULL
      );
      CREATE INDEX idx_transactions_status ON transactions(status);
      CREATE INDEX idx_transactions_type ON transactions(type);
      CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
      -- Duplicate detection leans on this.
      CREATE INDEX idx_transactions_reference ON transactions(transaction_reference);

      CREATE TABLE providers (
        id        TEXT PRIMARY KEY NOT NULL,
        name      TEXT NOT NULL,
        country   TEXT NOT NULL,
        enabled   INTEGER NOT NULL DEFAULT 1,
        maturity  TEXT NOT NULL DEFAULT 'DEMO'
      );

      -- An audit trail of what the app did. Deliberately carries no message
      -- content - only ids, counts and confidences.
      CREATE TABLE processing_events (
        id          TEXT PRIMARY KEY NOT NULL,
        kind        TEXT NOT NULL,
        message_id  TEXT,
        transaction_id TEXT,
        detail      TEXT,
        created_at  TEXT NOT NULL
      );
      CREATE INDEX idx_events_created ON processing_events(created_at DESC);

      CREATE TABLE settings (
        key        TEXT PRIMARY KEY NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: 'fees, taxes and categories',
    up: `
      -- What the money was for, the fee on top of the amount, each itemised tax
      -- (JSON) and receipt or LUKU details (JSON). Older records get none, and
      -- their category is picked by the rules when shown.
      ALTER TABLE transactions ADD COLUMN money_category TEXT;
      ALTER TABLE transactions ADD COLUMN fee REAL;
      ALTER TABLE transactions ADD COLUMN taxes TEXT NOT NULL DEFAULT '[]';
      ALTER TABLE transactions ADD COLUMN details TEXT NOT NULL DEFAULT '{}';

      -- The user's category choice per recipient. It holds recipient names, so
      -- it is deleted along with the records.
      CREATE TABLE category_rules (
        party_key      TEXT PRIMARY KEY NOT NULL,
        money_category TEXT NOT NULL,
        updated_at     TEXT NOT NULL
      );

      -- Mixx rules are built from real layouts as of 2026-09-12.
      UPDATE providers SET maturity = 'EXPERIMENTAL' WHERE id = 'mixx';
    `,
  },
  {
    version: 3,
    name: 'transaction IDs, to skip duplicates',
    up: `
      -- The transaction's ID (features/transactions/transactionKey.ts): the
      -- provider and reference, or a fingerprint of the message.
      ALTER TABLE transactions ADD COLUMN transaction_key TEXT;
      -- A record saved before duplicates were skipped that repeats an earlier
      -- one: the earlier record's id, until the copy is deleted or kept.
      ALTER TABLE transactions ADD COLUMN duplicate_of TEXT;
    `,
    async after(db) {
      await backfillTransactionKeys(db);
      // No two real records share an ID. Demo samples never block a real one.
      await db.execAsync(
        `CREATE UNIQUE INDEX idx_transactions_key ON transactions(transaction_key)
           WHERE transaction_key IS NOT NULL AND is_demo = 0`,
      );
    },
  },
];

/** Highest version this build knows about. */
export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

async function currentVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Bring the database up to `LATEST_VERSION`.
 * Safe to call on every launch; already-applied migrations are skipped.
 */
export async function migrate(db: SqlDatabase): Promise<number> {
  await db.execAsync('PRAGMA foreign_keys = ON');

  const from = await currentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= from) continue;

    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.up);
      if (migration.after) await migration.after(db);
    });
    // Outside the transaction: PRAGMA is not transactional in SQLite.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }

  return currentVersion(db);
}
