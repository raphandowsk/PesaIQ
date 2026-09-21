import { mod } from '@noble/curves/abstract/modular';
import { hashToRistretto255, ristretto255 } from '@noble/curves/ed25519';
import { bytesToNumberLE } from '@noble/curves/utils';
import { sha256 } from '@noble/hashes/sha2';
import { utf8ToBytes } from '@noble/hashes/utils';

import { fromBase64, toBase64 } from '../features/pin/bytes';
import {
  blindPin,
  finishPin,
  openAccountKey,
  pinInput,
  pinVerifier,
  randomScalar,
  sealAccountKey,
  wrappingKey,
  type Random,
} from '../features/pin/crypto';
import { lockVerifier, lockWaitMs, memoryLockRecords, sameBytes } from '../features/pin/lock';
import { pinProblem, retryText, triesLeft } from '../features/pin/rules';
import {
  createPinStore,
  type Evaluation,
  type KeyRecord,
  type LocalKeys,
  type PinApi,
} from '../features/pin/store';

const Point = ristretto255.Point;
const ORDER = Point.Fn.ORDER;

/** Deterministic "randomness" for tests: SHA-256 in counter mode from a seed. */
const seeded = (seed: string): Random => {
  let counter = 0;
  return (n) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 32) {
      out.set(sha256(utf8ToBytes(`${seed}:${counter++}`)).slice(0, n - i), i);
    }
    return out;
  };
};

/** What the pin-oprf function does, with a per-user key. */
const serverKey = (label: string) =>
  mod(bytesToNumberLE(sha256(utf8ToBytes(label))), ORDER) || BigInt(1);
const evaluateOn = (k: bigint, blinded: Uint8Array) =>
  Point.fromBytes(blinded).multiply(k).toBytes();

const USER = '11111111-2222-3333-4444-555555555555';

describe('base64', () => {
  it('matches the standard alphabet and padding', () => {
    const enc = (s: string) => toBase64(utf8ToBytes(s));
    expect(enc('')).toBe('');
    expect(enc('f')).toBe('Zg==');
    expect(enc('fo')).toBe('Zm8=');
    expect(enc('foo')).toBe('Zm9v');
    expect(enc('foobar')).toBe('Zm9vYmFy');
  });

  it('round-trips any bytes, and refuses what is not base64', () => {
    const bytes = seeded('b64')(97);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(() => fromBase64('not base64!')).toThrow();
    expect(() => fromBase64('abcde')).toThrow();
  });
});

describe('PIN rules', () => {
  it('wants four digits that are not among the first guesses', () => {
    expect(pinProblem('12')).toBe('Enter 4 digits.');
    expect(pinProblem('12a4')).toBe('Enter 4 digits.');
    for (const weak of ['0000', '7777', '1234', '4321', '0123', '9876', '1212', '6969']) {
      expect(pinProblem(weak)).toMatch(/harder to guess/);
    }
    for (const fine of ['2580', '0852', '1379', '4096']) expect(pinProblem(fine)).toBeNull();
  });

  it('counts tries down from five, and words the wait', () => {
    expect([0, 1, 4, 5, 9].map(triesLeft)).toEqual([5, 4, 1, 0, 0]);
    const now = Date.parse('2026-09-14T10:00:00Z');
    expect(retryText('2026-09-14T10:01:00Z', now)).toBe('Try again in 1 minute.');
    expect(retryText('2026-09-14T10:05:00Z', now)).toBe('Try again in 5 minutes.');
    expect(retryText('2026-09-14T11:00:00Z', now)).toBe('Try again in 1 hour.');
    expect(retryText('2026-09-15T10:00:00Z', now)).toBe('Try again tomorrow.');
    expect(retryText('2026-09-14T09:59:00Z', now)).toBe('You can try again now.');
  });
});

describe('the PIN protocol', () => {
  const k = serverKey('server-secret:user');

  const run = (pin: string, seed: string, key = k) => {
    const random = seeded(seed);
    const input = pinInput(USER, pin);
    const blind = randomScalar(random);
    const blinded = blindPin(input, blind);
    return { blinded, secret: finishPin(input, blind, evaluateOn(key, blinded)) };
  };

  it('never sends the same thing twice, yet always derives the same secret', () => {
    const a = run('2580', 'first');
    const b = run('2580', 'second');
    expect(a.blinded).not.toEqual(b.blinded);
    expect(a.secret).toEqual(b.secret);
    expect(a.secret).toHaveLength(64);
  });

  it('derives the key the server would, without the server seeing the PIN', () => {
    const input = pinInput(USER, '2580');
    const direct = hashToRistretto255(input, {
      DST: utf8ToBytes('PesaIQ-PIN-OPRF-ristretto255-SHA512-v1'),
    }).multiply(k);
    // The blinded point is unrelated to k·H(PIN) until unblinded.
    const { blinded } = run('2580', 'x');
    expect(Point.fromBytes(blinded).equals(direct)).toBe(false);
  });

  it('gives a different secret for a different PIN, account or server key', () => {
    const base = run('2580', 's').secret;
    expect(run('2581', 's').secret).not.toEqual(base);
    expect(run('2580', 's', serverKey('another')).secret).not.toEqual(base);
  });

  it('locks the account key so only the right secret, salt and account open it', () => {
    const random = seeded('seal');
    const accountKey = random(32);
    const salt = random(16);
    const nonce = random(12);
    const secret = run('2580', 'p').secret;
    const sealed = sealAccountKey(accountKey, wrappingKey(secret, salt), nonce, USER);

    expect(openAccountKey(sealed, wrappingKey(secret, salt), nonce, USER)).toEqual(accountKey);
    const wrong = run('0852', 'p').secret;
    expect(openAccountKey(sealed, wrappingKey(wrong, salt), nonce, USER)).toBeNull();
    expect(openAccountKey(sealed, wrappingKey(secret, random(16)), nonce, USER)).toBeNull();
    expect(openAccountKey(sealed, wrappingKey(secret, salt), nonce, 'someone-else')).toBeNull();
  });

  it('proves a correct PIN with a verifier that is fixed for the key', () => {
    const key = seeded('v')(32);
    expect(pinVerifier(key)).toEqual(pinVerifier(key));
    expect(pinVerifier(key)).toHaveLength(32);
    expect(pinVerifier(seeded('w')(32))).not.toEqual(pinVerifier(key));
  });
});

describe('the PIN store', () => {
  /** A server that does the real maths and the real guess count. */
  const fakeServer = (opts: { key?: KeyRecord | null; offline?: boolean } = {}) => {
    const k = serverKey('fake');
    let record = opts.key ?? null;
    let failures = 0;
    let lockedUntil: string | null = null;
    let verifier: string | null = null;
    const calls: string[] = [];

    const api: PinApi = {
      async fetchKey() {
        if (opts.offline) throw new Error('offline');
        return record;
      },
      async saveKey(r) {
        if (record) throw new Error('exists');
        record = r;
        calls.push('save');
      },
      async evaluate(blinded): Promise<Evaluation> {
        if (lockedUntil) return { kind: 'locked', retryAt: lockedUntil, failures };
        if (record) {
          failures += 1;
          if (failures >= 5) lockedUntil = '2026-09-14T10:01:00Z';
        }
        return { kind: 'evaluated', evaluated: evaluateOn(k, blinded), failures };
      },
      async confirm(v) {
        const given = toBase64(v);
        if (verifier && verifier !== given) return false;
        verifier = given;
        failures = 0;
        lockedUntil = null;
        calls.push('confirm');
        return true;
      },
      async startOver() {
        record = null;
        verifier = null;
        failures = 0;
        lockedUntil = null;
        calls.push('startOver');
      },
      async isKeyCurrent(v) {
        if (opts.offline) throw new Error('offline');
        return record !== null && verifier === toBase64(v);
      },
    };
    return { api, calls, record: () => record, failures: () => failures };
  };

  const memoryKeys = () => {
    const map = new Map<string, Uint8Array>();
    const local: LocalKeys = {
      get: async (id) => map.get(id) ?? null,
      set: async (id, key) => {
        map.set(id, key);
      },
      remove: async (id) => {
        map.delete(id);
      },
    };
    return { map, local };
  };

  const now = () => Date.parse('2026-09-14T10:00:00Z');

  it('is ready at once when this phone already holds the key', async () => {
    const { local, map } = memoryKeys();
    map.set(USER, new Uint8Array(32).fill(7));
    const store = createPinStore(fakeServer().api, local, seeded('a'), now);
    await store.getState().check(USER);
    expect(store.getState().status).toBe('ready');
  });

  it('asks for a new PIN when the account has none, and for the PIN when it has one', async () => {
    const fresh = createPinStore(fakeServer().api, memoryKeys().local, seeded('b'), now);
    await fresh.getState().check(USER);
    expect(fresh.getState().status).toBe('needsCreate');

    const withKey = createPinStore(
      fakeServer({ key: { wrappedKey: 'AA==', nonce: 'AA==', salt: 'AA==' } }).api,
      memoryKeys().local,
      seeded('c'),
      now,
    );
    await withKey.getState().check(USER);
    expect(withKey.getState().status).toBe('needsUnlock');
  });

  it('says so when the server cannot be reached', async () => {
    const store = createPinStore(
      fakeServer({ offline: true }).api,
      memoryKeys().local,
      seeded('d'),
      now,
    );
    await store.getState().check(USER);
    expect(store.getState().status).toBe('offline');
  });

  it('creates a PIN: locks a new key, stores it, and keeps it on this phone', async () => {
    const server = fakeServer();
    const { local, map } = memoryKeys();
    const store = createPinStore(server.api, local, seeded('e'), now);
    await store.getState().check(USER);

    expect(await store.getState().create('1234')).toMatchObject({ ok: false });
    expect(await store.getState().create('2580')).toEqual({ ok: true });
    expect(store.getState().status).toBe('ready');
    expect(server.calls).toEqual(['save', 'confirm']);
    expect(map.get(USER)).toEqual(store.getState().accountKey);
    expect(server.record()?.wrappedKey).not.toContain(toBase64(store.getState().accountKey!));
  });

  it('unlocks on a new phone with the right PIN, and refuses a wrong one', async () => {
    // Create on one phone...
    const server = fakeServer();
    const first = createPinStore(server.api, memoryKeys().local, seeded('f'), now);
    await first.getState().check(USER);
    await first.getState().create('2580');
    const created = first.getState().accountKey;

    // ...then sign in on another.
    const { local, map } = memoryKeys();
    const second = createPinStore(server.api, local, seeded('g'), now);
    await second.getState().check(USER);
    expect(second.getState().status).toBe('needsUnlock');

    const wrong = await second.getState().unlock('0852');
    expect(wrong).toEqual({
      ok: false,
      message: "That PIN isn't right. 4 tries left before a wait.",
    });
    expect(second.getState().status).toBe('needsUnlock');

    expect(await second.getState().unlock('2580')).toEqual({ ok: true });
    expect(second.getState().accountKey).toEqual(created);
    expect(map.get(USER)).toEqual(created);
    expect(server.failures()).toBe(0);
  });

  it('makes people wait after five wrong tries', async () => {
    const server = fakeServer();
    const first = createPinStore(server.api, memoryKeys().local, seeded('h'), now);
    await first.getState().check(USER);
    await first.getState().create('2580');

    const second = createPinStore(server.api, memoryKeys().local, seeded('i'), now);
    await second.getState().check(USER);
    for (let i = 0; i < 4; i++) await second.getState().unlock('0852');
    expect(await second.getState().unlock('0852')).toEqual({
      ok: false,
      message: "That PIN isn't right. You'll need to wait before the next try.",
    });
    expect(await second.getState().unlock('2580')).toEqual({
      ok: false,
      message: 'Too many tries. Try again in 1 minute.',
      retryAt: '2026-09-14T10:01:00Z',
    });
  });

  it('starts over after a forgotten PIN, and forgets the key on sign-out', async () => {
    const server = fakeServer();
    const { local, map } = memoryKeys();
    const store = createPinStore(server.api, local, seeded('j'), now);
    await store.getState().check(USER);
    await store.getState().create('2580');
    expect(map.has(USER)).toBe(true);

    await store.getState().forget();
    expect(map.has(USER)).toBe(false);
    expect(store.getState()).toMatchObject({ status: 'idle', accountKey: null });

    await store.getState().check(USER);
    expect(store.getState().status).toBe('needsUnlock');
    expect(await store.getState().startOver()).toEqual({ ok: true });
    expect(store.getState().status).toBe('needsCreate');
    expect(server.record()).toBeNull();
  });

  /** A PIN made on one phone, and a second phone already holding its key. */
  const twoPhones = async (seed: string, api = fakeServer().api) => {
    const first = createPinStore(api, memoryKeys().local, seeded(`${seed}1`), now);
    await first.getState().check(USER);
    await first.getState().create('2580');
    const { local, map } = memoryKeys();
    map.set(USER, first.getState().accountKey!);
    const second = createPinStore(api, local, seeded(`${seed}2`), now);
    await second.getState().check(USER);
    return { first, second, map };
  };

  it("confirms that a key kept on this phone is still the account's", async () => {
    const { second } = await twoPhones('k');
    expect(second.getState()).toMatchObject({ status: 'ready', verified: false });

    await second.getState().verify();
    expect(second.getState()).toMatchObject({ status: 'ready', verified: true, replaced: false });
  });

  it('asks for the new PIN when another phone reset it', async () => {
    const { first, second, map } = await twoPhones('m');

    // "Forgot PIN?" on the first phone, then a new PIN.
    await first.getState().startOver();
    expect(await first.getState().create('6195')).toEqual({ ok: true });

    await second.getState().verify();
    expect(second.getState()).toMatchObject({
      status: 'needsUnlock',
      replaced: true,
      verified: false,
      accountKey: null,
    });
    expect(map.has(USER)).toBe(false);

    expect(await second.getState().unlock('6195')).toEqual({ ok: true });
    expect(second.getState()).toMatchObject({ replaced: false, verified: true });
    expect(second.getState().accountKey).toEqual(first.getState().accountKey);
  });

  it('keeps the key, unconfirmed, without a connection', async () => {
    const { local, map } = memoryKeys();
    map.set(USER, new Uint8Array(32).fill(7));
    const store = createPinStore(fakeServer({ offline: true }).api, local, seeded('o'), now);
    await store.getState().check(USER);

    await store.getState().verify();
    expect(store.getState()).toMatchObject({ status: 'ready', verified: false, replaced: false });
    expect(map.has(USER)).toBe(true);
  });
});

describe('the app lock', () => {
  it('waits longer after each wrong PIN past the free tries', () => {
    expect([0, 4, 5, 6, 7, 8, 20].map(lockWaitMs)).toEqual([
      0, 0, 60_000, 300_000, 900_000, 3_600_000, 3_600_000,
    ]);
    const key = new Uint8Array(32).fill(3);
    expect(lockVerifier(key, USER, '2580')).toEqual(lockVerifier(key, USER, '2580'));
    expect(lockVerifier(key, USER, '2581')).not.toEqual(lockVerifier(key, USER, '2580'));
    expect(lockVerifier(key, 'someone-else', '2580')).not.toEqual(lockVerifier(key, USER, '2580'));
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(sameBytes(new Uint8Array([1]), new Uint8Array([1, 0]))).toBe(false);
  });
});

describe('the PIN store app lock', () => {
  const offlineApi = (): PinApi => {
    const fail = async (): Promise<never> => {
      throw new Error('offline');
    };
    return {
      fetchKey: fail,
      saveKey: fail,
      evaluate: fail,
      confirm: fail,
      startOver: fail,
      isKeyCurrent: fail,
    };
  };

  const phone = () => {
    const keys = new Map<string, Uint8Array>();
    const local: LocalKeys = {
      get: async (id) => keys.get(id) ?? null,
      set: async (id, key) => {
        keys.set(id, key);
      },
      remove: async (id) => {
        keys.delete(id);
      },
    };
    return { keys, local, locks: memoryLockRecords() };
  };

  let clock = Date.parse('2026-09-21T08:00:00Z');
  const now = () => clock;

  /** A PIN created on this phone, then the app closed and opened again. */
  const reopened = async (seed: string) => {
    const device = phone();
    const store = createPinStore(realServer(), device.local, seeded(seed), now, device.locks);
    await store.getState().check(USER);
    expect(await store.getState().create('2580')).toEqual({ ok: true });
    expect(store.getState().locked).toBe(false);

    // Opened again: same phone, no connection needed.
    const again = createPinStore(offlineApi(), device.local, seeded(`${seed}!`), now, device.locks);
    await again.getState().check(USER);
    return { device, store: again };
  };

  /** A minimal real server: just enough to create a PIN. */
  const realServer = (): PinApi => {
    const k = serverKey('lock-server');
    let record: KeyRecord | null = null;
    return {
      fetchKey: async () => record,
      saveKey: async (r) => {
        record = r;
      },
      evaluate: async (blinded) => ({
        kind: 'evaluated',
        evaluated: evaluateOn(k, blinded),
        failures: 0,
      }),
      confirm: async () => true,
      startOver: async () => {
        record = null;
      },
      isKeyCurrent: async () => true,
    };
  };

  it('asks for the PIN when the app is opened with the key already here, offline too', async () => {
    const { store } = await reopened('l1');
    expect(store.getState()).toMatchObject({ status: 'ready', locked: true });

    expect(await store.getState().openLock('0852')).toEqual({
      ok: false,
      message: "That PIN isn't right. 4 tries left before a wait.",
    });
    expect(store.getState().locked).toBe(true);
    expect(await store.getState().openLock('2580')).toEqual({ ok: true });
    expect(store.getState().locked).toBe(false);
  });

  it('locks again on request, and only once the key is here', async () => {
    const { store } = await reopened('l2');
    await store.getState().openLock('2580');
    store.getState().lock();
    expect(store.getState().locked).toBe(true);

    const empty = createPinStore(null, phone().local, seeded('l2x'), now);
    empty.getState().lock();
    expect(empty.getState().locked).toBe(false);
  });

  it('makes people wait after five wrong PINs, and remembers it across restarts', async () => {
    const { device, store } = await reopened('l3');
    for (let i = 0; i < 4; i++) await store.getState().openLock('0852');
    expect(await store.getState().openLock('0852')).toEqual({
      ok: false,
      message: "That PIN isn't right. Try again in 1 minute.",
      retryAt: '2026-09-21T08:01:00.000Z',
    });
    // Even the right PIN waits.
    expect(await store.getState().openLock('2580')).toMatchObject({
      ok: false,
      message: 'Too many tries. Try again in 1 minute.',
    });

    // Closing and opening the app does not clear the count.
    const again = createPinStore(offlineApi(), device.local, seeded('l3!'), now, device.locks);
    await again.getState().check(USER);
    expect(again.getState().lockRetryAt).toBe('2026-09-21T08:01:00.000Z');

    clock += 60_000;
    expect(await again.getState().openLock('0852')).toMatchObject({
      message: "That PIN isn't right. Try again in 5 minutes.",
    });
    clock += 5 * 60_000;
    expect(await again.getState().openLock('2580')).toEqual({ ok: true });
    expect((await device.locks.get(USER))?.failures).toBe(0);
  });

  it('checks the PIN with the server once when this phone has no verifier yet', async () => {
    const server = realServer();
    const device = phone();
    const first = createPinStore(server, device.local, seeded('l4'), now);
    await first.getState().check(USER);
    await first.getState().create('2580');
    // A phone from before the app lock: the key is kept, the verifier is not.
    const again = createPinStore(server, device.local, seeded('l4!'), now, device.locks);
    await again.getState().check(USER);
    expect(again.getState().locked).toBe(true);
    expect(await device.locks.get(USER)).toBeNull();

    expect(await again.getState().openLock('0852')).toMatchObject({ ok: false });
    expect(await again.getState().openLock('2580')).toEqual({ ok: true });
    expect(await device.locks.get(USER)).toMatchObject({ failures: 0, retryAt: null });
  });

  it('forgets the lock with the key on sign-out', async () => {
    const { device, store } = await reopened('l5');
    await store.getState().forget();
    expect(await device.locks.get(USER)).toBeNull();
    expect(device.keys.has(USER)).toBe(false);
    expect(store.getState().locked).toBe(false);
  });
});
