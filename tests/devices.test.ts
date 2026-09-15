import { describePhone } from '../features/devices/describe';
import {
  CHECK_IN_EVERY_MS,
  createDevicesStore,
  type Device,
  type DeviceIds,
  type DevicesApi,
} from '../features/devices/store';

const PHONE = { label: 'Samsung SM-A515F', platform: 'android' } as const;

describe('describing this phone', () => {
  it('names an Android phone by maker and model, without saying the maker twice', () => {
    expect(describePhone({ os: 'android', brand: 'samsung', model: 'SM-A515F' })).toEqual(PHONE);
    expect(describePhone({ os: 'android', brand: 'google', model: 'Google Pixel 7' }).label).toBe(
      'Google Pixel 7',
    );
    expect(describePhone({ os: 'android' }).label).toBe('Android phone');
  });

  it('says iPhone or iPad on iOS, and names the web preview', () => {
    expect(describePhone({ os: 'ios', idiom: 'phone' })).toEqual({
      label: 'iPhone',
      platform: 'ios',
    });
    expect(describePhone({ os: 'ios', idiom: 'pad' }).label).toBe('iPad');
    expect(describePhone({ os: 'web' })).toEqual({ label: 'Web browser', platform: 'web' });
  });
});

/** One account's `devices` rows. */
function fakeServer(clock: () => number) {
  const rows = new Map<string, Device>();
  const calls: string[] = [];
  let failing = false;
  const api: DevicesApi = {
    async list() {
      if (failing) throw new Error('offline');
      return [...rows.values()];
    },
    async checkIn(d) {
      if (failing) throw new Error('offline');
      calls.push('checkIn');
      rows.set(d.id, { ...d, lastSeenAt: new Date(clock()).toISOString() });
    },
    async remove(id) {
      if (failing) throw new Error('offline');
      rows.delete(id);
    },
    async removeOthers(keepId) {
      if (failing) throw new Error('offline');
      for (const id of [...rows.keys()]) if (id !== keepId) rows.delete(id);
    },
  };
  return { api, rows, calls, fail: () => (failing = true) };
}

function memoryIds(): DeviceIds {
  const ids = new Map<string, string>();
  return {
    async idFor(userId) {
      if (!ids.has(userId)) ids.set(userId, `device-${ids.size + 1}`);
      return ids.get(userId)!;
    },
  };
}

describe('the signed-in phones list', () => {
  let t = Date.parse('2026-09-14T10:00:00Z');
  const clock = () => t;

  it('checks in as the same row each time, at most every few minutes', async () => {
    const server = fakeServer(clock);
    const store = createDevicesStore(server.api, memoryIds(), () => PHONE, clock);

    await store.getState().checkIn('u1');
    await store.getState().checkIn('u1');
    expect(server.calls).toEqual(['checkIn']);

    t += CHECK_IN_EVERY_MS;
    await store.getState().checkIn('u1');
    expect(server.calls).toHaveLength(2);
    expect(server.rows.size).toBe(1);
  });

  it('lists the phones newest first, and knows which one is this phone', async () => {
    const server = fakeServer(clock);
    server.rows.set('other', {
      id: 'other',
      label: 'iPhone',
      platform: 'ios',
      lastSeenAt: '2026-09-01T08:00:00.000Z',
    });
    const store = createDevicesStore(server.api, memoryIds(), () => PHONE, clock);

    await store.getState().checkIn('u1');
    await store.getState().load('u1');
    const { devices, thisId, status } = store.getState();
    expect(status).toBe('ready');
    expect(devices.map((d) => d.id)).toEqual([thisId, 'other']);
    expect(devices[0]).toMatchObject(PHONE);
  });

  it('keeps a separate row for each account signed in on the phone', async () => {
    const server = fakeServer(clock);
    const ids = memoryIds();
    const store = createDevicesStore(server.api, ids, () => PHONE, clock);
    await store.getState().checkIn('u1');
    await store.getState().checkIn('u2');
    expect(await ids.idFor('u1')).not.toBe(await ids.idFor('u2'));
    expect(server.rows.size).toBe(2);
  });

  it('drops the other phones once they are signed out, keeping this one', async () => {
    const server = fakeServer(clock);
    server.rows.set('lost', {
      id: 'lost',
      label: 'Tecno Spark',
      platform: 'android',
      lastSeenAt: '2026-09-01T08:00:00.000Z',
    });
    const store = createDevicesStore(server.api, memoryIds(), () => PHONE, clock);
    await store.getState().checkIn('u1');
    await store.getState().load('u1');
    expect(store.getState().devices).toHaveLength(2);

    await store.getState().forgetOtherPhones('u1');
    const { thisId, devices } = store.getState();
    expect([...server.rows.keys()]).toEqual([thisId]);
    expect(devices.map((d) => d.id)).toEqual([thisId]);
  });

  it('never fails when the other phones’ rows cannot be removed', async () => {
    const server = fakeServer(clock);
    const store = createDevicesStore(server.api, memoryIds(), () => PHONE, clock);
    await store.getState().checkIn('u1');
    server.fail();
    await expect(store.getState().forgetOtherPhones('u1')).resolves.toBeUndefined();
  });

  it('leaves the list on sign-out, and never holds sign-out up', async () => {
    const server = fakeServer(clock);
    const store = createDevicesStore(server.api, memoryIds(), () => PHONE, clock);
    await store.getState().checkIn('u1');
    await store.getState().forgetThisPhone('u1');
    expect(server.rows.size).toBe(0);

    await store.getState().checkIn('u1');
    server.fail();
    await expect(store.getState().forgetThisPhone('u1')).resolves.toBeUndefined();
    await store.getState().load('u1');
    expect(store.getState().status).toBe('failed');
  });
});
