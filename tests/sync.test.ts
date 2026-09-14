import { randomBytes } from 'node:crypto';

import type { SqlDatabase } from '../database/client';
import { messageRepository, syncRepository, transactionRepository } from '../database/repositories';
import { parseMessage } from '../features/parser';
import { dedupeKeyOf, keyTag, openRecord, sealRecord, syncKeys } from '../features/sync/crypto';
import { isOtherAccountError, syncOnce, type SyncDeps } from '../features/sync/engine';
import { decodePayload, encodePayload } from '../features/sync/payload';
import { START } from '../features/sync/remote';
import { createSyncStore } from '../features/sync/store';
import { transactionFromParseResult, type Transaction } from '../features/transactions/model';
import { useAppStore } from '../features/transactions/store';
import { FakeRemote } from './support/fakeRemote';
import { createMigratedDatabase } from './support/nodeSqlite';
import { saveNew } from './support/save';

// Invented accounts, keys, people and messages.
const USER = '5b0c1f7e-0000-4000-8000-000000000001';
const OTHER_USER = '5b0c1f7e-0000-4000-8000-000000000002';
const KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);
const WALLET = 'DEMO-WALLET-A';
const received = (ref: string) => `You have received TZS 12,345 from ALICE NDOSI. Ref: ${ref}.`;

const T1 = '2026-09-14T08:00:00.000Z';
const T2 = '2026-09-14T09:00:00.000Z';
const T3 = '2026-09-14T09:30:00.000Z';

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

const sync = (db: SqlDatabase, remote: FakeRemote, over: Partial<SyncDeps> = {}) =>
  syncOnce({
    db,
    remote,
    keys: syncKeys(KEY, USER),
    newId,
    random,
    pageSize: 5,
    batchSize: 3,
    ...over,
  });

/** A pasted message saved on a phone, with its SMS, as the store saves it. */
async function saveOn(db: SqlDatabase, id: string, text: string, at = T1): Promise<Transaction> {
  const result = parseMessage(text, { sender: WALLET });
  await messageRepository.insert(db, {
    id: `msg-${id}`,
    originalText: result.originalText,
    normalizedText: result.normalizedText,
    sender: WALLET,
    receivedAt: at,
    source: 'MANUAL',
    isDemo: false,
    createdAt: at,
  });
  return transactionRepository.insert(
    db,
    transactionFromParseResult(result, {
      id,
      now: at,
      sourceMessageId: `msg-${id}`,
      parseResultId: null,
    }),
  );
}

const records = (db: SqlDatabase) => transactionRepository.list(db);

describe('locking records', () => {
  it('opens only as the row, account and key it was locked for', () => {
    const keys = syncKeys(KEY, USER);
    const data = new Uint8Array([1, 2, 3]);
    const { ciphertext, nonce } = sealRecord(keys, 'row-1', data, random(12));

    expect(openRecord(keys, 'row-1', ciphertext, nonce)).toEqual(data);
    expect(openRecord(keys, 'row-2', ciphertext, nonce)).toBeNull();
    expect(openRecord(syncKeys(KEY, OTHER_USER), 'row-1', ciphertext, nonce)).toBeNull();
    expect(openRecord(syncKeys(OTHER_KEY, USER), 'row-1', ciphertext, nonce)).toBeNull();
  });

  it('fingerprints a transaction ID without revealing it, differently per account key', () => {
    const id = 'ref:mixx:QH42T8LM9P';
    const mine = dedupeKeyOf(syncKeys(KEY, USER), id);
    expect(mine).toBe(dedupeKeyOf(syncKeys(KEY, USER), id));
    expect(mine).not.toContain('QH42');
    expect(mine).not.toBe(dedupeKeyOf(syncKeys(OTHER_KEY, USER), id));
    expect(dedupeKeyOf(syncKeys(KEY, USER), null)).toBeNull();
    expect(keyTag(syncKeys(KEY, USER))).not.toBe(keyTag(syncKeys(OTHER_KEY, USER)));
  });
});

describe('what a record carries', () => {
  it('leaves out what only this phone knows, and keeps any name intact', async () => {
    const db = await phone();
    const saved = await saveOn(db, 'a1', received('UNIQ99001'));
    const t = { ...saved, counterparty: 'Zuhura Kîvuyo 🙂' };

    const payload = decodePayload(encodePayload(t));
    expect(payload).toMatchObject({
      counterparty: 'Zuhura Kîvuyo 🙂',
      amount: t.amount,
      transactionKey: t.transactionKey,
    });
    for (const local of ['id', 'sourceMessageId', 'parseResultId', 'isDemo', 'duplicateOf']) {
      expect(payload).not.toHaveProperty(local);
    }
  });

  it('refuses anything this app did not write', () => {
    expect(decodePayload(new Uint8Array([0xff, 0x00]))).toBeNull();
    expect(decodePayload(new Uint8Array([...'{"v":2}'].map((c) => c.charCodeAt(0))))).toBeNull();
  });
});

describe('the local database', () => {
  it('queues the deletion of a synced record, and only of a synced one', async () => {
    const db = await phone();
    await saveOn(db, 'a1', received('UNIQ99001'));
    await saveOn(db, 'a2', received('UNIQ99002'));
    await syncRepository.markSent(db, 'a1', 'row-a1', T1);

    await transactionRepository.remove(db, 'a1');
    await transactionRepository.remove(db, 'a2');
    expect((await syncRepository.listDeletions(db)).map((d) => d.syncId)).toEqual(['row-a1']);
  });
});

describe('syncing between phones', () => {
  it('brings a record to the other phone, and the server learns nothing readable', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    const saved = await saveOn(a, 'a1', received('UNIQ99001'));

    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 1, pending: 0 });
    await expect(sync(b, remote)).resolves.toMatchObject({ received: 1 });

    const [onB] = await records(b);
    expect(onB).toMatchObject({
      amount: saved.amount,
      counterparty: saved.counterparty,
      transactionReference: 'UNIQ99001',
      transactionKey: saved.transactionKey,
      isDemo: false,
      // The SMS stays on the phone it was pasted on.
      sourceMessageId: null,
    });

    const server = JSON.stringify([...remote.rows.values()]);
    for (const secret of ['ALICE', 'UNIQ99001', '12345', 'received']) {
      expect(server).not.toContain(secret);
    }
  });

  it('never sends demo samples', async () => {
    const a = await phone();
    const remote = new FakeRemote();
    const demo = await saveOn(a, 'demo-1', received('UNIQ99001'));
    await transactionRepository.update(a, demo.id, { isDemo: true }, T1);

    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 0, pending: 0 });
    expect(remote.rows.size).toBe(0);
  });

  it('carries an edit back, then has nothing more to send', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await sync(a, remote);
    await sync(b, remote);

    const [onB] = await records(b);
    await transactionRepository.update(b, onB.id, { counterparty: 'ALICE N.' }, T2);
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 1 });
    await expect(sync(a, remote)).resolves.toMatchObject({ received: 1 });
    expect((await records(a))[0].counterparty).toBe('ALICE N.');

    // Settled: the rows read again on purpose change nothing, and nothing goes back.
    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 0, received: 0 });
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 0, received: 0 });
  });

  it('carries a deletion, leaving nothing readable on the server', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await sync(a, remote);
    await sync(b, remote);

    await transactionRepository.remove(a, 'a1');
    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 1, pending: 0 });
    const [row] = remote.rows.values();
    expect(row).toMatchObject({ deleted: true, dedupeKey: null });

    await expect(sync(b, remote)).resolves.toMatchObject({ removed: 1 });
    expect(await records(b)).toEqual([]);
    // Deleted because the other phone did: nothing to send back.
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 0, pending: 0 });
  });

  it('makes one record of a transaction saved on both phones before either synced', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await saveOn(b, 'b1', received('UNIQ99001'));

    await sync(a, remote);
    await expect(sync(b, remote)).resolves.toMatchObject({ conflicts: 0, pending: 0 });
    await sync(a, remote);

    expect(remote.rows.size).toBe(1);
    expect(await records(a)).toHaveLength(1);
    const onB = await records(b);
    expect(onB).toHaveLength(1);
    // B's copy keeps its SMS.
    expect(onB[0]).toMatchObject({ id: 'b1', sourceMessageId: 'msg-b1' });
  });

  it('also joins them when the server refuses the second copy', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await sync(a, remote);
    await saveOn(b, 'b1', received('UNIQ99001'));

    // B has already pulled past A's row, as if the two raced.
    const keys = syncKeys(KEY, USER);
    await syncRepository.setState(b, 'account', USER);
    await syncRepository.setState(b, 'key', keyTag(keys));
    await syncRepository.setState(
      b,
      'pulled_to',
      JSON.stringify({ updatedAt: '2099-01-01T00:00:00.000Z', id: START.id }),
    );

    await expect(sync(b, remote)).resolves.toMatchObject({ conflicts: 0, pending: 0 });
    expect(remote.rows.size).toBe(1);
    const [rowId] = remote.rows.keys();
    expect((await syncRepository.findBySyncId(b, rowId))?.transaction.id).toBe('b1');
  });

  it('keeps the latest edit when two phones change a record', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await sync(a, remote);
    await sync(b, remote);
    const [onB] = await records(b);

    await transactionRepository.update(a, 'a1', { counterparty: 'EARLIER' }, T2);
    await transactionRepository.update(b, onB.id, { counterparty: 'LATER' }, T3);
    // The older edit reaches the server first.
    await sync(a, remote);
    await sync(b, remote);
    await sync(a, remote);

    expect((await records(a))[0].counterparty).toBe('LATER');
    expect((await records(b))[0].counterparty).toBe('LATER');
  });

  it('pages through rows sent together without losing any', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    for (let i = 0; i < 13; i += 1) await saveOn(a, `a${i}`, received(`UNIQ${91000 + i}`));

    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 13 });
    // Batches of 3: rows in a batch share one server time.
    expect(new Set([...remote.rows.values()].map((r) => r.updatedAt)).size).toBe(5);

    await expect(sync(b, remote)).resolves.toMatchObject({ received: 13 });
    expect(await records(b)).toHaveLength(13);
  });

  it("counts, and skips, a row it can't open", async () => {
    const [c, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await saveOn(c, 'c1', received('UNIQ99001'));
    await sync(c, remote, { keys: syncKeys(OTHER_KEY, USER) });

    await expect(sync(b, remote)).resolves.toMatchObject({ unreadable: 1, received: 0 });
    expect(await records(b)).toEqual([]);
  });

  it('keeps everything to send when the connection fails', async () => {
    const a = await phone();
    const remote = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));

    remote.offline = true;
    await expect(sync(a, remote)).rejects.toThrow();
    expect(await syncRepository.countPending(a)).toBe(1);

    remote.offline = false;
    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 1, pending: 0 });
  });

  it("won't mix another account's synced records into this one", async () => {
    const a = await phone();
    const mine = new FakeRemote();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await sync(a, mine);

    const theirs = new FakeRemote();
    const asThem = { keys: syncKeys(OTHER_KEY, OTHER_USER) };
    const refused = await sync(a, theirs, asThem).catch((e: unknown) => e);
    expect(isOtherAccountError(refused)).toBe(true);

    // Emptied of the first account's records, the phone can sync the second.
    await transactionRepository.removeAll(a);
    await expect(sync(a, theirs, asThem)).resolves.toMatchObject({ sent: 0 });
    expect(theirs.rows.size).toBe(0);
    // And the first account's copy is untouched.
    expect([...mine.rows.values()].every((r) => !r.deleted)).toBe(true);
  });

  it('sends everything again under a new account key', async () => {
    const a = await phone();
    await saveOn(a, 'a1', received('UNIQ99001'));
    await sync(a, new FakeRemote());

    // "Forgot PIN" cleared the server and made a new key.
    const cleared = new FakeRemote();
    await expect(sync(a, cleared, { keys: syncKeys(OTHER_KEY, USER) })).resolves.toMatchObject({
      sent: 1,
    });
    expect(cleared.rows.size).toBe(1);
  });
});

describe('the sync store', () => {
  const store = (remote: FakeRemote | null) =>
    createSyncStore({ remote, newId, random, now: () => 42 });

  beforeEach(async () => {
    await useAppStore.getState().initialize({ database: await phone(), now: () => T1 });
  });

  it("syncs the app's records, and says when another account holds this phone", async () => {
    const remote = new FakeRemote();
    const sync = store(remote);
    await saveNew(received('UNIQ99001'), WALLET);

    await sync.getState().syncNow({ userId: USER, accountKey: KEY });
    expect(sync.getState()).toMatchObject({ phase: 'synced', lastSyncedAt: 42, pending: 0 });
    // The demo samples stayed on the phone.
    expect(remote.rows.size).toBe(1);

    await sync.getState().syncNow({ userId: OTHER_USER, accountKey: OTHER_KEY });
    expect(sync.getState().phase).toBe('otherAccount');
  });

  it('reports a failed sync, and a build with no server', async () => {
    const remote = new FakeRemote();
    remote.offline = true;
    const failing = store(remote);
    await failing.getState().syncNow({ userId: USER, accountKey: KEY });
    expect(failing.getState().phase).toBe('failed');

    const none = store(null);
    await none.getState().syncNow({ userId: USER, accountKey: KEY });
    expect(none.getState().phase).toBe('unavailable');
  });
});
