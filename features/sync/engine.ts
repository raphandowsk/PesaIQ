/**
 * One sync: pull what other phones changed, then send this phone's deletions
 * and changes.
 *
 * - Records are locked on the phone (crypto.ts) before they leave it. The
 *   server sees ids, times and fingerprints only.
 * - The latest edit wins, by when the change was made.
 * - The same transaction saved on two phones becomes one record: the
 *   fingerprints match and both phones tie their copy to one row.
 * - Deletions travel as rows marked deleted, their contents gone.
 * - Demo samples and SMS messages never leave the phone.
 */
import type { SqlDatabase } from '../../database/client';
import {
  isUnsent,
  messageRepository,
  syncRepository,
  transactionRepository,
  type LocalRecord,
} from '../../database/repositories';
import { dedupeKeyOf, keyTag, KEY_VERSION, openRecord, sealRecord, type SyncKeys } from './crypto';
import { decodePayload, encodePayload, tombstoneBytes, type RecordPayload } from './payload';
import {
  isDuplicateRejection,
  START,
  type OutgoingRecord,
  type PullCursor,
  type RecordsRemote,
  type RemoteRecord,
} from './remote';

export interface SyncDeps {
  db: SqlDatabase;
  remote: RecordsRemote;
  keys: SyncKeys;
  /** A new UUID, for a record's first trip to the server. */
  newId: () => string;
  random: (byteCount: number) => Uint8Array;
  /** Rows per pull. */
  pageSize?: number;
  /** Rows per push. */
  batchSize?: number;
}

export interface SyncReport {
  /** Records added or changed here from other phones. */
  received: number;
  /** Records deleted here because another phone deleted them. */
  removed: number;
  /** Changes and deletions this phone sent. */
  sent: number;
  /** Rows this phone could not open: locked with another key, or damaged. */
  unreadable: number;
  /** A second server record for a transaction already here, kept for review. */
  conflicts: number;
  /** Changes still waiting to be sent. */
  pending: number;
}

export class OtherAccountError extends Error {
  constructor() {
    super('This phone holds records synced to another account');
    this.name = 'OtherAccountError';
  }
}

/** By name rather than `instanceof`, which a transpiled Error subclass can lose. */
export const isOtherAccountError = (e: unknown): boolean =>
  e instanceof Error && e.name === 'OtherAccountError';

/** Rows are read again from this far back, so a slow write from another phone is never skipped. */
export const PULL_OVERLAP_MS = 5 * 60 * 1000;

/** Server times carry microseconds; only milliseconds are handed to Date. */
export const isoOf = (time: string): string =>
  new Date(time.replace(/(\.\d{3})\d+/, '$1')).toISOString();

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const cursorFrom = (text: string | null): PullCursor | null => {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<PullCursor>;
    return typeof value.updatedAt === 'string' && typeof value.id === 'string'
      ? { updatedAt: value.updatedAt, id: value.id }
      : null;
  } catch {
    return null;
  }
};

export async function syncOnce(deps: SyncDeps): Promise<SyncReport> {
  const report: SyncReport = {
    received: 0,
    removed: 0,
    sent: 0,
    unreadable: 0,
    conflicts: 0,
    pending: 0,
  };
  await claimPhone(deps);
  await pull(deps, report);
  await sendDeletions(deps, report);
  await sendChanges(deps, report);
  report.pending = await syncRepository.countPending(deps.db);
  return report;
}

/**
 * The phone syncs with one account. Another account's synced records block
 * sync until they are deleted here. A new account key (after "Forgot PIN"
 * cleared the server) means sending everything again.
 */
async function claimPhone({ db, keys }: SyncDeps): Promise<void> {
  const account = await syncRepository.getState(db, 'account');
  const tag = await syncRepository.getState(db, 'key');
  const currentTag = keyTag(keys);
  if (account === keys.userId && tag === currentTag) return;

  if (account && account !== keys.userId && (await syncRepository.countSynced(db)) > 0) {
    throw new OtherAccountError();
  }

  await db.withTransactionAsync(async () => {
    if (account) await syncRepository.startOver(db);
    await syncRepository.setState(db, 'account', keys.userId);
    await syncRepository.setState(db, 'key', currentTag);
  });
}

async function pull(deps: SyncDeps, report: SyncReport): Promise<void> {
  const { db, remote } = deps;
  const size = deps.pageSize ?? 500;
  const saved = cursorFrom(await syncRepository.getState(db, 'pulled_to'));

  let after: PullCursor = saved
    ? {
        updatedAt: new Date(Date.parse(isoOf(saved.updatedAt)) - PULL_OVERLAP_MS).toISOString(),
        id: START.id,
      }
    : START;
  let newest = saved;

  for (;;) {
    const rows = await remote.pull(after, size);
    for (const row of rows) await receive(deps, row, report);
    if (rows.length === 0) break;
    const last = rows[rows.length - 1];
    // Kept exactly as the server wrote it: its microseconds order the pages.
    after = { updatedAt: last.updatedAt, id: last.id };
    newest = after;
    if (rows.length < size) break;
  }

  if (newest) await syncRepository.setState(db, 'pulled_to', JSON.stringify(newest));
}

/** Apply one row from the server. Safe to repeat: the pull overlaps on purpose. */
async function receive(deps: SyncDeps, row: RemoteRecord, report: SyncReport): Promise<void> {
  const { db, keys } = deps;
  const editedAt = isoOf(row.editedAt);
  const local = await syncRepository.findBySyncId(db, row.id);

  if (row.deleted) {
    if (!local) return;
    // Edited here after the deletion: the edit wins, and is sent below.
    if (isUnsent(local) && local.transaction.updatedAt > editedAt) return;
    await db.withTransactionAsync(() => removeHere(db, local));
    report.removed += 1;
    return;
  }

  if (local && !isUnsent(local) && local.syncedEdit === editedAt) return;
  // Edited here since: ours is newer and is sent below.
  if (local && isUnsent(local) && local.transaction.updatedAt >= editedAt) return;

  const bytes = openRecord(keys, row.id, row.ciphertext, row.nonce);
  const payload = bytes ? decodePayload(bytes) : null;
  if (!payload) {
    report.unreadable += 1;
    return;
  }

  await db.withTransactionAsync(async () => {
    if (local) {
      await overwrite(db, local.transaction.id, row.id, payload, editedAt, report);
      report.received += 1;
      return;
    }

    const same = payload.transactionKey
      ? await syncRepository.findByKey(db, payload.transactionKey)
      : null;

    if (same && !same.syncId) {
      // Saved here too before either phone synced: one transaction, one record.
      await syncRepository.link(db, same.transaction.id, row.id);
      if (same.transaction.updatedAt > editedAt) return;
      await overwrite(db, same.transaction.id, row.id, payload, editedAt, report);
      report.received += 1;
      return;
    }

    await insertHere(db, row.id, payload, editedAt, same?.transaction.id ?? null, report);
    report.received += 1;
  });
}

/**
 * Take the server's version of a record. It keeps its local links (the SMS
 * stays attached). A transaction ID another record here already has is kept
 * off it, and the pair goes to duplicate review instead.
 */
async function overwrite(
  db: SqlDatabase,
  id: string,
  syncId: string,
  payload: RecordPayload,
  editedAt: string,
  report: SyncReport,
): Promise<void> {
  const clash = payload.transactionKey
    ? await syncRepository.findByKey(db, payload.transactionKey)
    : null;
  const patch =
    clash && clash.transaction.id !== id
      ? { ...payload, transactionKey: null, duplicateOf: clash.transaction.id }
      : payload;
  if (patch !== payload) report.conflicts += 1;
  await transactionRepository.update(db, id, patch, editedAt);
  await syncRepository.markReceived(db, id, syncId, editedAt);
}

async function insertHere(
  db: SqlDatabase,
  syncId: string,
  payload: RecordPayload,
  editedAt: string,
  copyOf: string | null,
  report: SyncReport,
): Promise<void> {
  if (copyOf) report.conflicts += 1;
  await transactionRepository.insert(db, {
    ...payload,
    ...(copyOf ? { transactionKey: null, duplicateOf: copyOf } : { duplicateOf: null }),
    id: syncId,
    sourceMessageId: null,
    parseResultId: null,
    isDemo: false,
    updatedAt: editedAt,
  });
  await syncRepository.markReceived(db, syncId, syncId, editedAt);
}

/** Deleted on another phone: gone here too, with its SMS. Nothing is sent back. */
async function removeHere(db: SqlDatabase, local: LocalRecord): Promise<void> {
  await transactionRepository.remove(db, local.transaction.id);
  if (local.syncId) await syncRepository.clearDeletion(db, local.syncId);
  const messageId = local.transaction.sourceMessageId;
  if (messageId && (await transactionRepository.countBySourceMessage(db, messageId)) === 0) {
    await messageRepository.remove(db, messageId);
  }
}

async function sendDeletions(deps: SyncDeps, report: SyncReport): Promise<void> {
  const { db, remote, keys, random } = deps;
  const deletions = await syncRepository.listDeletions(db);
  for (const batch of chunks(deletions, deps.batchSize ?? 100)) {
    const rows: OutgoingRecord[] = batch.map((d) => ({
      id: d.syncId,
      dedupeKey: null,
      ...sealRecord(keys, d.syncId, tombstoneBytes(), random(12)),
      keyVersion: KEY_VERSION,
      deleted: true,
      editedAt: d.deletedAt,
    }));
    await remote.push(rows);
    for (const d of batch) await syncRepository.clearDeletion(db, d.syncId);
    report.sent += batch.length;
  }
}

interface Outgoing {
  local: LocalRecord;
  row: OutgoingRecord;
}

async function sendChanges(deps: SyncDeps, report: SyncReport): Promise<void> {
  const { db, remote, keys, random, newId } = deps;
  const unsent = await syncRepository.listUnsent(db);

  for (const batch of chunks(unsent, deps.batchSize ?? 100)) {
    const outgoing: Outgoing[] = batch.map((local) => {
      const syncId = local.syncId ?? newId();
      return {
        local,
        row: {
          id: syncId,
          dedupeKey: dedupeKeyOf(keys, local.transaction.transactionKey),
          ...sealRecord(keys, syncId, encodePayload(local.transaction), random(12)),
          keyVersion: KEY_VERSION,
          deleted: false,
          editedAt: local.transaction.updatedAt,
        },
      };
    });

    try {
      await remote.push(outgoing.map((o) => o.row));
    } catch (e) {
      if (!isDuplicateRejection(e)) throw e;
      // One of them is already on the server from another phone: one at a time.
      for (const o of outgoing) await sendOne(deps, o, report);
      continue;
    }
    for (const o of outgoing) await markSent(db, o);
    report.sent += outgoing.length;
  }
}

const markSent = (db: SqlDatabase, { local, row }: Outgoing) =>
  syncRepository.markSent(db, local.transaction.id, row.id, row.editedAt);

async function sendOne(deps: SyncDeps, o: Outgoing, report: SyncReport): Promise<void> {
  try {
    await deps.remote.push([o.row]);
    await markSent(deps.db, o);
    report.sent += 1;
  } catch (e) {
    if (!isDuplicateRejection(e) || !o.row.dedupeKey) throw e;
    const theirs = await deps.remote.findLive(o.row.dedupeKey);
    // Never sent from here: tie this record to the other phone's row.
    if (theirs && !o.local.syncId) await receive(deps, theirs, report);
    else report.conflicts += 1;
  }
}
