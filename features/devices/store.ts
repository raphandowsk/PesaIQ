/**
 * The phones signed in to the account (`devices` on the server): each phone
 * adds itself and says when it was last active, and the list shows them all.
 *
 * A phone's row id is made once per account on the phone and kept there, so
 * the same phone is always the same row.
 */
import { create } from 'zustand';

export type DevicePlatform = 'android' | 'ios' | 'web';

export interface Device {
  id: string;
  label: string;
  platform: DevicePlatform;
  lastSeenAt: string;
}

export interface ThisPhone {
  label: string;
  platform: DevicePlatform;
}

/** The server side. Methods throw on failure. */
export interface DevicesApi {
  list(): Promise<Device[]>;
  /** Adds this phone or updates it, as active now. */
  checkIn(device: ThisPhone & { id: string }): Promise<void>;
  remove(id: string): Promise<void>;
}

/** This phone's row id for an account, made on first use and kept. */
export interface DeviceIds {
  idFor(userId: string): Promise<string>;
}

/** A phone reports itself at most this often. */
export const CHECK_IN_EVERY_MS = 5 * 60 * 1000;

export interface DevicesState {
  devices: Device[];
  /** This phone's row, once known. */
  thisId: string | null;
  status: 'idle' | 'loading' | 'ready' | 'failed';
  checkIn(userId: string): Promise<void>;
  load(userId: string): Promise<void>;
  /** Signing out: this phone leaves the list. Never throws. */
  forgetThisPhone(userId: string): Promise<void>;
}

const newestFirst = (a: Device, b: Device) => b.lastSeenAt.localeCompare(a.lastSeenAt);

export function createDevicesStore(
  api: DevicesApi | null,
  ids: DeviceIds,
  thisPhone: () => ThisPhone,
  now: () => number = Date.now,
) {
  let lastCheckIn = { userId: '', at: -Infinity };

  return create<DevicesState>()((set) => ({
    devices: [],
    thisId: null,
    status: 'idle',

    async checkIn(userId) {
      if (!api) return;
      if (lastCheckIn.userId === userId && now() - lastCheckIn.at < CHECK_IN_EVERY_MS) return;
      try {
        const id = await ids.idFor(userId);
        await api.checkIn({ id, ...thisPhone() });
        lastCheckIn = { userId, at: now() };
        set({ thisId: id });
      } catch {
        // Tried again on the next launch or return to the app.
      }
    },

    async load(userId) {
      if (!api) {
        set({ status: 'failed' });
        return;
      }
      set({ status: 'loading' });
      try {
        const [id, devices] = await Promise.all([ids.idFor(userId), api.list()]);
        set({ thisId: id, devices: [...devices].sort(newestFirst), status: 'ready' });
      } catch {
        set({ status: 'failed' });
      }
    },

    async forgetThisPhone(userId) {
      if (api) {
        try {
          await api.remove(await ids.idFor(userId));
        } catch {
          // Signing out must not wait on this. The row just ages.
        }
      }
      lastCheckIn = { userId: '', at: -Infinity };
      set({ devices: [], thisId: null, status: 'idle' });
    },
  }));
}
