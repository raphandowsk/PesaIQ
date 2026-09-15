import { randomBytes } from 'node:crypto';

import type { SqlDatabase } from '../database/client';
import {
  categoryRuleRepository,
  profileRepository,
  providerRepository,
  syncRepository,
} from '../database/repositories';
import { openRecord, syncKeys } from '../features/sync/crypto';
import { syncOnce, type SyncDeps } from '../features/sync/engine';
import { toAsciiBytes } from '../features/sync/payload';
import {
  decodePreferences,
  encodePreferences,
  mergePreferences,
  PREFERENCES_ROW,
  type Preferences,
} from '../features/sync/preferences';
import { FakeRemote } from './support/fakeRemote';
import { createMigratedDatabase } from './support/nodeSqlite';

// Invented account, keys and recipients. Times are earlier than any real
// clock, so a deletion stamped by SQLite is always the later change.
const USER = '5b0c1f7e-0000-4000-8000-000000000001';
const KEY = new Uint8Array(32).fill(7);
const OTHER_KEY = new Uint8Array(32).fill(9);
const T1 = '2026-01-01T08:00:00.000Z';
const T2 = '2026-01-01T09:00:00.000Z';
const T3 = '2026-01-01T10:00:00.000Z';

let ids = 0;
const newId = () => `00000000-0000-4000-8000-${String((ids += 1)).padStart(12, '0')}`;
const random = (n: number) => new Uint8Array(randomBytes(n));

const opened: SqlDatabase[] = [];
const phone = async () => {
  const db = await createMigratedDatabase();
  await providerRepository.seed(db);
  opened.push(db);
  return db;
};
afterEach(async () => {
  while (opened.length) await opened.pop()!.closeAsync();
});

const sync = (db: SqlDatabase, remote: FakeRemote, over: Partial<SyncDeps> = {}) =>
  syncOnce({ db, remote, keys: syncKeys(KEY, USER), newId, random, ...over });

const serverDoc = (remote: FakeRemote, key = KEY) => {
  const row = remote.preferences!;
  return decodePreferences(
    openRecord(syncKeys(key, USER), PREFERENCES_ROW, row.ciphertext, row.nonce)!,
  );
};

describe('merging preferences', () => {
  it('keeps the later entry for each key, from either side', () => {
    const here: Preferences = {
      categories: {
        alice: { category: 'OTHER_SPENDING', at: T2 },
        bob: { category: null, at: T3 },
      },
      providers: {},
    };
    const server: Preferences = {
      categories: {
        alice: { category: 'RECEIVED_FROM_PEOPLE', at: T1 },
        bob: { category: 'OTHER_SPENDING', at: T2 },
        carol: { category: 'OTHER_SPENDING', at: T1 },
      },
      providers: { mixx: { enabled: false, at: T1 } },
    };

    const m = mergePreferences(here, server);
    expect(m.merged.categories).toEqual({
      alice: here.categories.alice,
      bob: here.categories.bob,
      carol: server.categories.carol,
    });
    expect(m.toApply.categories).toEqual([['carol', server.categories.carol]]);
    expect(m.toApply.providers).toEqual([['mixx', server.providers.mixx]]);
    expect(m.newerHere).toBe(true);
  });

  it('has nothing to do when both sides match', () => {
    const same: Preferences = {
      categories: { alice: { category: 'OTHER_SPENDING', at: T1 } },
      providers: { mixx: { enabled: true, at: T1 } },
    };
    expect(mergePreferences(same, same)).toMatchObject({
      toApply: { categories: [], providers: [] },
      newerHere: false,
    });
  });

  it('settles an exact tie the same way on both phones', () => {
    const a: Preferences = {
      categories: { alice: { category: 'OTHER_SPENDING', at: T1 } },
      providers: {},
    };
    const b: Preferences = {
      categories: { alice: { category: 'RECEIVED_FROM_PEOPLE', at: T1 } },
      providers: {},
    };
    expect(mergePreferences(a, b).merged).toEqual(mergePreferences(b, a).merged);
  });

  it('keeps the later name, a removal included', () => {
    const removedHere: Preferences = {
      categories: {},
      providers: {},
      name: { name: null, at: T3 },
    };
    const namedOnServer: Preferences = {
      categories: {},
      providers: {},
      name: { name: 'Asha', at: T2 },
    };

    const m = mergePreferences(removedHere, namedOnServer);
    expect(m.merged.name).toEqual(removedHere.name);
    expect(m.toApply.name).toBeNull();
    expect(m.newerHere).toBe(true);

    expect(mergePreferences(namedOnServer, removedHere).toApply.name).toEqual(removedHere.name);
  });

  it('reads a document written before names existed', () => {
    const old = decodePreferences(toAsciiBytes({ v: 1, categories: {}, providers: {} }));
    expect(old).toEqual({ categories: {}, providers: {} });
  });

  it('round-trips a name in any script', () => {
    const doc: Preferences = {
      categories: {},
      providers: {},
      name: { name: 'Zuhura Ñandú', at: T1 },
    };
    expect(decodePreferences(encodePreferences(doc))).toEqual(doc);
  });
});

describe('the local database', () => {
  it('remembers when a category was forgotten, until it is learned again', async () => {
    const db = await phone();
    await categoryRuleRepository.set(db, 'alice ndosi', 'OTHER_SPENDING', T1);
    await categoryRuleRepository.removeAll(db);
    expect((await syncRepository.readPreferences(db)).categories['alice ndosi']).toMatchObject({
      category: null,
    });

    await categoryRuleRepository.set(db, 'alice ndosi', 'RECEIVED_FROM_PEOPLE', T2);
    expect((await syncRepository.readPreferences(db)).categories['alice ndosi']).toEqual({
      category: 'RECEIVED_FROM_PEOPLE',
      at: T2,
    });
  });

  it('dates a provider choice only when the user changes it', async () => {
    const db = await phone();
    expect((await syncRepository.readPreferences(db)).providers).toEqual({});

    const mixx = (await providerRepository.list(db)).find((p) => p.id === 'mixx')!;
    await providerRepository.setEnabled(db, 'mixx', mixx.enabled);
    expect((await syncRepository.readPreferences(db)).providers).toEqual({});

    await providerRepository.setEnabled(db, 'mixx', !mixx.enabled);
    expect((await syncRepository.readPreferences(db)).providers.mixx).toMatchObject({
      enabled: !mixx.enabled,
    });
  });
});

describe('syncing preferences between phones', () => {
  it('brings a remembered category to the other phone, unreadable to the server', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await categoryRuleRepository.set(a, 'alice ndosi', 'OTHER_SPENDING', T1);

    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 1 });
    await expect(sync(b, remote)).resolves.toMatchObject({ preferences: 1 });
    expect(await categoryRuleRepository.list(b)).toEqual({ 'alice ndosi': 'OTHER_SPENDING' });
    expect(JSON.stringify(remote.preferences)).not.toContain('alice');

    // Settled: nothing more either way.
    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 0, preferences: 0 });
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 0, preferences: 0 });
  });

  it('keeps what each phone learned while apart', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await categoryRuleRepository.set(a, 'alice ndosi', 'OTHER_SPENDING', T1);
    await categoryRuleRepository.set(b, 'bakari juma', 'RECEIVED_FROM_PEOPLE', T2);

    await sync(a, remote);
    await sync(b, remote);
    await sync(a, remote);

    const both = { 'alice ndosi': 'OTHER_SPENDING', 'bakari juma': 'RECEIVED_FROM_PEOPLE' };
    expect(await categoryRuleRepository.list(a)).toEqual(both);
    expect(await categoryRuleRepository.list(b)).toEqual(both);
  });

  it('carries "Forget" to the other phone', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await categoryRuleRepository.set(a, 'alice ndosi', 'OTHER_SPENDING', T1);
    await sync(a, remote);
    await sync(b, remote);

    await categoryRuleRepository.removeAll(b);
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 1 });
    await expect(sync(a, remote)).resolves.toMatchObject({ preferences: 1 });
    expect(await categoryRuleRepository.list(a)).toEqual({});
  });

  it('carries a provider choice, and nothing but categories and provider choices', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    const mixx = (await providerRepository.list(a)).find((p) => p.id === 'mixx')!;
    await providerRepository.setEnabled(a, 'mixx', !mixx.enabled);

    await sync(a, remote);
    await expect(sync(b, remote)).resolves.toMatchObject({ preferences: 1 });
    expect((await providerRepository.list(b)).find((p) => p.id === 'mixx')?.enabled).toBe(
      !mixx.enabled,
    );

    const doc = serverDoc(remote);
    expect(Object.keys(doc!)).toEqual(['categories', 'providers']);
    expect(Object.keys(doc!.providers)).toEqual(['mixx']);
  });

  it('brings the name to the other phone, unreadable to the server', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await profileRepository.setName(a, 'Asha', T1);

    await expect(sync(a, remote)).resolves.toMatchObject({ sent: 1 });
    await expect(sync(b, remote)).resolves.toMatchObject({ preferences: 1 });
    expect(await profileRepository.getName(b)).toEqual({ name: 'Asha', at: T1 });
    expect(JSON.stringify(remote.preferences)).not.toContain('Asha');
  });

  it('carries a removed name to the other phone', async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await profileRepository.setName(a, 'Asha', T1);
    await sync(a, remote);
    await sync(b, remote);

    await profileRepository.setName(b, null, T2);
    await expect(sync(b, remote)).resolves.toMatchObject({ sent: 1 });
    await expect(sync(a, remote)).resolves.toMatchObject({ preferences: 1 });
    expect(await profileRepository.getName(a)).toEqual({ name: null, at: T2 });
  });

  it("is sent even when the server's copy is dated ahead of this phone's clock", async () => {
    const [a, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await categoryRuleRepository.set(a, 'alice ndosi', 'OTHER_SPENDING', T1);
    await sync(a, remote, { now: () => '2099-01-01T00:00:00.000Z' });

    await categoryRuleRepository.set(b, 'bakari juma', 'RECEIVED_FROM_PEOPLE', T2);
    await sync(b, remote);
    expect(Object.keys(serverDoc(remote)!.categories).sort()).toEqual([
      'alice ndosi',
      'bakari juma',
    ]);
  });

  it("leaves a document it can't open as it is", async () => {
    const [c, b] = [await phone(), await phone()];
    const remote = new FakeRemote();
    await categoryRuleRepository.set(c, 'alice ndosi', 'OTHER_SPENDING', T1);
    await sync(c, remote, { keys: syncKeys(OTHER_KEY, USER) });
    const before = remote.preferences;

    await categoryRuleRepository.set(b, 'bakari juma', 'RECEIVED_FROM_PEOPLE', T2);
    await expect(sync(b, remote)).resolves.toMatchObject({ unreadable: 1, preferences: 0 });
    expect(remote.preferences).toEqual(before);
  });
});
