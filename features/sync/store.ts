/**
 * Sync's state for the screens, and one sync at a time.
 *
 * `syncNow` runs the engine against the app's database. A call while a sync
 * is running becomes one more run after it, so a burst of changes costs at
 * most two syncs.
 */
import { create } from 'zustand';

import { useAppStore } from '../transactions/store';
import { syncKeys } from './crypto';
import { isOtherAccountError, syncOnce } from './engine';
import type { RecordsRemote } from './remote';

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'failed' | 'otherAccount' | 'unavailable';

export interface SyncContext {
  userId: string;
  accountKey: Uint8Array;
}

export const SYNC_MESSAGES = {
  failed: "Couldn't sync. It will try again when you're back online.",
  otherAccount:
    "This phone holds another account's synced records. Delete all transactions here to sync this account.",
  unavailable: "Sync isn't set up in this build.",
} as const;

export interface SyncStoreDeps {
  remote: RecordsRemote | null;
  newId: () => string;
  random: (byteCount: number) => Uint8Array;
  now?: () => number;
}

export interface SyncState {
  phase: SyncPhase;
  /** When the last sync finished (ms since the epoch). */
  lastSyncedAt: number | null;
  /** Changes waiting to be sent, as of the last sync. */
  pending: number;
  syncNow(context: SyncContext): Promise<void>;
  /** Forget the state: signed out, or sync turned off. */
  reset(): void;
}

export function createSyncStore(deps: SyncStoreDeps) {
  const now = deps.now ?? Date.now;
  let running: Promise<void> | null = null;
  let queued: SyncContext | null = null;

  return create<SyncState>()((set) => {
    const runOnce = async (context: SyncContext) => {
      const { remote } = deps;
      if (!remote) {
        set({ phase: 'unavailable' });
        return;
      }
      set({ phase: 'syncing' });
      try {
        const app = useAppStore.getState();
        const report = await app.runSync((db) =>
          syncOnce({
            db,
            remote,
            keys: syncKeys(context.accountKey, context.userId),
            newId: deps.newId,
            random: deps.random,
          }),
        );
        // Only a change from another phone alters what the screens show.
        const changes = report.received + report.removed + report.conflicts + report.preferences;
        if (changes > 0) await app.refresh();
        set({ phase: 'synced', lastSyncedAt: now(), pending: report.pending });
      } catch (e) {
        set({ phase: isOtherAccountError(e) ? 'otherAccount' : 'failed' });
      }
    };

    return {
      phase: 'idle',
      lastSyncedAt: null,
      pending: 0,

      syncNow(context) {
        if (running) {
          queued = context;
          return running;
        }
        running = (async () => {
          await runOnce(context);
          while (queued) {
            const next = queued;
            queued = null;
            await runOnce(next);
          }
        })().finally(() => {
          running = null;
        });
        return running;
      },

      reset() {
        queued = null;
        set({ phase: 'idle', lastSyncedAt: null, pending: 0 });
      },
    };
  });
}
