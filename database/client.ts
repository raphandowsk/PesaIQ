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
 *
 * Async only, on purpose: on web, expo-sqlite's synchronous API needs
 * SharedArrayBuffer, which PesaIQ does not enable (see metro.config.js).
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

/**
 * How long a statement waits for another connection's lock before failing.
 * SQLite's default is not to wait at all.
 */
const BUSY_TIMEOUT_MS = 5000;

let instance: SqlDatabase | null = null;
let opening: Promise<SqlDatabase> | null = null;

export interface OpenDeps {
  /** Opens a connection to the file. expo-sqlite by default. */
  connect?: (name: string) => Promise<SqlDatabase>;
  /** Brings the schema up to date. `migrations.ts` by default. */
  migrate?: (db: SqlDatabase) => Promise<unknown>;
}

/**
 * Open (once) the on-device database and run migrations.
 *
 * A second caller while it opens waits for the same open, rather than opening
 * a second connection to the file. `deps` is the test seam.
 */
export function getDatabase(deps: OpenDeps = {}): Promise<SqlDatabase> {
  if (instance) return Promise.resolve(instance);
  opening ??= open(deps).finally(() => {
    opening = null;
  });
  return opening;
}

async function open({
  connect = connectExpoSqlite,
  migrate = runMigrations,
}: OpenDeps): Promise<SqlDatabase> {
  const db = await connect(DATABASE_NAME);

  try {
    // A connection an earlier copy of the app left open (a reload in Expo Go,
    // say) can hold a lock for a while: wait for it instead of failing at once.
    await db.execAsync(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await migrate(db);
    instance = db;
    return db;
  } catch (e) {
    // Not kept, so closed: Try again then starts from a fresh connection
    // instead of leaving this one open beside it.
    await db.closeAsync().catch(() => undefined);
    throw e;
  }
}

/** Imports expo-sqlite lazily, so importing a repository in a test does not drag the native module in. */
async function connectExpoSqlite(name: string): Promise<SqlDatabase> {
  const SQLite = await import('expo-sqlite');
  const db = await SQLite.openDatabaseAsync(name);
  return {
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
}

async function runMigrations(db: SqlDatabase): Promise<void> {
  const { migrate } = await import('./migrations');
  await migrate(db);
}

/** Test seam: point the app at a database built elsewhere. */
export function setDatabase(db: SqlDatabase | null): void {
  instance = db;
}

/** Shown when another tab or window already holds the web database. */
export const DATABASE_IN_USE_MESSAGE =
  'PesaIQ is already open in another tab or window. Close the other one, then tap Try again.';

/**
 * Shown when the phone's database stays locked: a copy of the app that did not
 * close properly still holds it, and only closing the app lets it go.
 */
export const DATABASE_LOCKED_MESSAGE =
  'Your records are still held by a copy of PesaIQ that did not close properly. Close the app completely (swipe it away from your recent apps), then open it again. Your saved records are safe.';

/**
 * Turn a failure to open the database into something a person can act on.
 *
 * On web, expo-sqlite keeps its file under an exclusive browser lock, so a
 * second tab cannot open it, and the raw DOMException means nothing to a user.
 * The name can be lost crossing the worker boundary, so the message is checked
 * too. Any other failure passes through unchanged.
 */
export function describeOpenError(error: unknown): string {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';

  if (
    name === 'NoModificationAllowedError' ||
    /NoModificationAllowedError|createSyncAccessHandle|Access Handles cannot be created/i.test(
      message,
    )
  ) {
    return DATABASE_IN_USE_MESSAGE;
  }
  // SQLITE_BUSY, past the busy timeout.
  if (/database is locked|SQLITE_BUSY/i.test(message)) return DATABASE_LOCKED_MESSAGE;
  return message || 'Could not open the database.';
}
