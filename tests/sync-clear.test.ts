import { randomBytes } from 'node:crypto';

import type { SqlDatabase } from '../database/client';
import { messageRepository, syncRepository, transactionRepository } from '../database/repositories';
import { parseMessage } from '../features/parser';
import { syncKeys } from '../features/sync/crypto';
import { forgetServer, isSyncClearedError, syncOnce } from '../features/sync/engine';
import { createSyncStore } from '../features/sync/store';
import { transactionFromParseResult } from '../features/transactions/model';
import { useAppStore } from '../features/transactions/store';
import { FakeRemote } from './support/fakeRemote';
import { createMigratedDatabase } from './support/nodeSqlite';
import { saveNew } from './support/save';

// Invented account, key and message.
const USER = '5b0c1f7e-0000-4000-8000-000000000001';
const KEY = new Uint8Array(32).fill(7);
const T1 = '2026-09-14T08:00:00.000Z';
const MESSAGE = 'You have received TZS 12,345 from ALICE NDOSI. Ref: UNIQ99001.';

let ids = 0;
const newId = () => `00000000-0000-4000-8000-${String((ids += 1)).padStart(12, '0')}`;
const random = (n: number) => new Uint8Array(randomBytes(n));

const opened: SqlDatabase[] = [];
const phone = async () => {
  const db = await createMigratedDatabase();
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length) await opened.pop()!.closeAsync();
});

const sync = (db: SqlDatabase, remote: FakeRemote) =>
  syncOnce({ db, remote, keys: syncKeys(KEY, USER), newId, random });

async function saveOn(db: SqlDatabase, id: string) {
  const result = parseMessage(MESSAGE, { sender: 'DEMO-WALLET-A' });
  await messageRepository.insert(db, {
    id: `msg-${id}`,
    originalText: result.originalText,
    normalizedText: result.normalizedText,
    sender: 'DEMO-WALLET-A',
    receivedAt: T1,
    source: 'MANUAL',
    isDemo: false,
    createdAt: T1,
  });
  await transactionRepository.insert(
    db,
    transactionFromParseResult(result, {
      id,
      now: T1,
      sourceMessageId: `msg-${id}`,
      parseResultId: null,
    }),
  );
}

describe('removing the synced data from the server', () => {
  it('stops sync on the other phones, which keep everything', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(a, 'a1');
    await sync(a, remote);
    await sync(b, remote);

    // "Turn off and remove" on A.
    await forgetServer(a, await remote.clearServer());
    expect(remote.rows.size).toBe(0);
    expect(remote.preferences).toBeNull();

    const stopped = await sync(b, remote).catch((e: unknown) => e);
    expect(isSyncClearedError(stopped)).toBe(true);
    expect(await transactionRepository.list(b)).toHaveLength(1);
    // Turned back on, B sends what it has again.
    expect(await syncRepository.countPending(b)).toBe(1);
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 1 });
  });

  it('lets the phone that removed it start again from scratch', async () => {
    const a = await phone();
    const remote = new FakeRemote();
    await saveOn(a, 'a1');
    await sync(a, remote);

    await forgetServer(a, await remote.clearServer());
    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 1 });
    expect(remote.rows.size).toBe(1);
  });

  it("doesn't stop a phone syncing for the first time after an earlier removal", async () => {
    const remote = new FakeRemote();
    await remote.clearServer();
    const c = await phone();
    await saveOn(c, 'c1');
    await expect(sync(c, remote)).resolves.toMatchObject({ sent: 1 });
  });
});

describe('the sync store', () => {
  const store = (remote: FakeRemote) => createSyncStore({ remote, newId, random });
  const context = { userId: USER, accountKey: KEY };

  beforeEach(async () => {
    await useAppStore.getState().initialize({ database: await phone(), now: () => T1 });
    await useAppStore.getState().setSetting('cloudSync', true);
    await saveNew(MESSAGE, 'DEMO-WALLET-A');
  });

  it('"Turn off and remove" empties the server and turns sync off here', async () => {
    const remote = new FakeRemote();
    const sync = store(remote);
    await sync.getState().syncNow(context);
    expect(remote.rows.size).toBe(1);

    await sync.getState().clearAndTurnOff();
    expect(remote.rows.size).toBe(0);
    expect(useAppStore.getState().settings.cloudSync).toBe(false);
    expect(sync.getState().notice).toBeNull();
  });

  it('turns sync off, and says why, when another phone removed the data', async () => {
    const remote = new FakeRemote();
    const sync = store(remote);
    await sync.getState().syncNow(context);

    await remote.clearServer();
    await sync.getState().syncNow(context);
    expect(sync.getState().notice).toBe('clearedElsewhere');
    expect(useAppStore.getState().settings.cloudSync).toBe(false);
    // Nothing was sent back after the removal.
    expect(remote.rows.size).toBe(0);
  });

  it('changes nothing when the server cannot be reached', async () => {
    const remote = new FakeRemote();
    const sync = store(remote);
    await sync.getState().syncNow(context);

    remote.offline = true;
    await expect(sync.getState().clearAndTurnOff()).rejects.toThrow();
    expect(useAppStore.getState().settings.cloudSync).toBe(true);
    remote.offline = false;
    expect(remote.rows.size).toBe(1);
  });
});
