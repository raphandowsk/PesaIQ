import {
  DATABASE_LOCKED_MESSAGE,
  describeOpenError,
  getDatabase,
  setDatabase,
  type SqlDatabase,
} from '../database/client';

// Stand-ins for the phone's SQLite connection and the migrations: these tests
// are about how the connection is opened, not about SQL.
const fakeConnection = () => ({
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn(),
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
  closeAsync: jest.fn().mockResolvedValue(undefined),
});

// What Expo Go showed on an Android phone on 2026-09-15.
const PHONE_LOCK_TEXT =
  "Call to function 'NativeStatement.finalizeAsync' has been rejected.\n→ Caused by: Error code : database is locked";

beforeEach(() => setDatabase(null));

describe('opening the phone database', () => {
  it('opens one connection when asked twice at once', async () => {
    const connect = jest.fn(async () => fakeConnection() as SqlDatabase);
    const migrate = jest.fn(async () => 3);

    const [a, b] = await Promise.all([
      getDatabase({ connect, migrate }),
      getDatabase({ connect, migrate }),
    ]);
    expect(a).toBe(b);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(migrate).toHaveBeenCalledTimes(1);
  });

  it('waits for another connection’s lock instead of failing at once', async () => {
    const connection = fakeConnection();
    await getDatabase({ connect: async () => connection, migrate: async () => 3 });
    expect(connection.execAsync).toHaveBeenCalledWith('PRAGMA busy_timeout = 5000');
  });

  it('closes a connection that failed, so Try again starts fresh', async () => {
    const first = fakeConnection();
    const second = fakeConnection();
    const connect = jest
      .fn<Promise<SqlDatabase>, [string]>()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const migrate = jest
      .fn<Promise<unknown>, [SqlDatabase]>()
      .mockRejectedValueOnce(new Error(PHONE_LOCK_TEXT))
      .mockResolvedValueOnce(3);

    await expect(getDatabase({ connect, migrate })).rejects.toThrow('database is locked');
    expect(first.closeAsync).toHaveBeenCalled();

    await expect(getDatabase({ connect, migrate })).resolves.toBe(second);
    expect(connect).toHaveBeenCalledTimes(2);
    expect(second.closeAsync).not.toHaveBeenCalled();
  });
});

describe('the locked-database message', () => {
  it('explains the lock the phone reported', () => {
    expect(describeOpenError(new Error(PHONE_LOCK_TEXT))).toBe(DATABASE_LOCKED_MESSAGE);
  });

  it('says what to do, and not what SQLite said', () => {
    expect(DATABASE_LOCKED_MESSAGE).toMatch(/Close the app completely/);
    expect(DATABASE_LOCKED_MESSAGE).toMatch(/records are safe/);
    expect(DATABASE_LOCKED_MESSAGE).not.toMatch(/finalizeAsync|SQLITE|locked/);
  });
});
