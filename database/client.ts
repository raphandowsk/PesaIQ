/**
 * The database port.
 *
 * Repositories depend on this interface, not on expo-sqlite directly. Two
 * things fall out of that: the repositories can be tested against real SQL in
 * Node (see `tests/support/nodeSqlite.ts`) rather than against mocks, and a
 * future swap of the driver touches one file.
 *
 * The shape is a subset of expo-sqlite's async API, so the production adapter
 * is close to a pass-through.
 */

export type SqlParam = string | number | null;

export interface SqlRunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDatabase {
  /** Run one or more statements with no parameters and no result. */
  execAsync(sql: string): Promise<void>;
  /** Run a parameterised write. */
  runAsync(sql: string, params?: SqlParam[]): Promise<SqlRunResult>;
  /** Read many rows. */
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  /** Read one row, or null. */
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  /** Run `task` inside a transaction, rolling back if it throws. */
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
  closeAsync(): Promise<void>;
}

export const DATABASE_NAME = 'pesaiq.db';

let instance: SqlDatabase | null = null;

/**
 * Open (once) the on-device database and run migrations.
 *
 * Imports expo-sqlite lazily so that importing a repository in a test does not
 * drag the native module in.
 */
export async function getDatabase(): Promise<SqlDatabase> {
  if (instance) return instance;

  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);

  const adapter: SqlDatabase = {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, params),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, params),
    withTransactionAsync: (task) => db.withTransactionAsync(task),
    closeAsync: () => db.closeAsync(),
  };

  const { migrate } = await import('./migrations');
  await migrate(adapter);

  instance = adapter;
  return adapter;
}

/** Test seam: point the app at a database built elsewhere. */
export function setDatabase(db: SqlDatabase | null): void {
  instance = db;
}
