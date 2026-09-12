/**
 * Schema migrations.
 *
 * Versioned with SQLite's own `user_version` pragma rather than a table we
 * maintain. Each migration is applied once, in order, inside a transaction.
 *
 * Never edit a migration that has shipped — add another one. An installed app
 * has already run the old version and will not run it again.
 */
import type { SqlDatabase } from './client';

export interface Migration {
  version: number;
  name: string;
  up: string;
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
    });
    // Outside the transaction: PRAGMA is not transactional in SQLite.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
  }

  return currentVersion(db);
}
