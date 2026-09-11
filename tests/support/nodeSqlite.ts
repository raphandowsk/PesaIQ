/**
 * A `SqlDatabase` backed by Node's built-in sqlite, for tests only.
 *
 * This is not a mock: the repositories run their real SQL against a real SQLite
 * engine, so constraints, indexes, transactions and type coercion all behave as
 * they will on device. Node 22.5+ ships `node:sqlite`, so nothing is added to
 * the dependency tree, and nothing here is bundled into the app.
 */
import { DatabaseSync } from 'node:sqlite';

import type { SqlDatabase, SqlParam } from '../../database/client';
import { migrate } from '../../database/migrations';

/** `undefined` is not a valid SQLite bind value; normalise it to null. */
const bind = (params: SqlParam[] = []): SqlParam[] =>
  params.map((p) => (p === undefined ? null : p));

export function createTestDatabase(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  let depth = 0;

  return {
    execAsync(sql) {
      db.exec(sql);
      return Promise.resolve();
    },

    runAsync(sql, params = []) {
      const r = db.prepare(sql).run(...bind(params));
      return Promise.resolve({
        changes: Number(r.changes),
        lastInsertRowId: Number(r.lastInsertRowid),
      });
    },

    getAllAsync<T>(sql: string, params: SqlParam[] = []) {
      return Promise.resolve(db.prepare(sql).all(...bind(params)) as T[]);
    },

    getFirstAsync<T>(sql: string, params: SqlParam[] = []) {
      return Promise.resolve((db.prepare(sql).get(...bind(params)) as T | undefined) ?? null);
    },

    async withTransactionAsync(task) {
      // SQLite has no nested transactions; mirror expo-sqlite by only opening
      // one at the outermost level so seeding can call into repositories that
      // themselves use transactions.
      if (depth > 0) {
        depth += 1;
        try {
          await task();
        } finally {
          depth -= 1;
        }
        return;
      }

      depth = 1;
      db.exec('BEGIN');
      try {
        await task();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth = 0;
      }
    },

    closeAsync() {
      db.close();
      return Promise.resolve();
    },
  };
}

/** A migrated, empty database. */
export async function createMigratedDatabase(): Promise<SqlDatabase> {
  const db = createTestDatabase();
  await migrate(db);
  return db;
}
