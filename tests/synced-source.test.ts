import { randomBytes } from 'node:crypto';

import type { SqlDatabase } from '../database/client';
import { syncKeys } from '../features/sync/crypto';
import { syncOnce } from '../features/sync/engine';
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
const app = useAppStore.getState;

const opened: SqlDatabase[] = [];
afterEach(async () => {
  while (opened.length) await opened.pop()!.closeAsync();
});

/** Open a phone's database in the app store, as the app does on launch. */
async function openPhone(): Promise<SqlDatabase> {
  const db = await createMigratedDatabase();
  opened.push(db);
  await app().initialize({ database: db, now: () => T1 });
  return db;
}

const syncHere = (remote: FakeRemote) =>
  app().runSync((db) =>
    syncOnce({
      db,
      remote,
      keys: syncKeys(KEY, USER),
      newId,
      random: (n) => new Uint8Array(randomBytes(n)),
    }),
  );

describe('where a record came from', () => {
  it('tells a record synced from another phone apart from one saved here', async () => {
    const remote = new FakeRemote();

    await openPhone();
    const mine = await saveNew(MESSAGE, 'DEMO-WALLET-A');
    await syncHere(remote);
    // Sent from here, but saved here.
    await expect(app().isFromOtherPhone(mine.id)).resolves.toBe(false);

    await openPhone();
    await syncHere(remote);
    await app().refresh();
    const theirs = app().transactions.find((t) => !t.isDemo)!;
    expect(theirs.sourceMessageId).toBeNull();
    await expect(app().isFromOtherPhone(theirs.id)).resolves.toBe(true);

    const demo = app().transactions.find((t) => t.isDemo)!;
    await expect(app().isFromOtherPhone(demo.id)).resolves.toBe(false);
  });

  it('does not count a record whose message was deleted here', async () => {
    await openPhone();
    const mine = await saveNew(MESSAGE, 'DEMO-WALLET-A');
    await syncHere(new FakeRemote());
    await app().deleteAllMessages();

    await expect(app().isFromOtherPhone(mine.id)).resolves.toBe(false);
  });
});
