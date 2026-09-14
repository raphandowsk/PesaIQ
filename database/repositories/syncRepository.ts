/**
 * Sync's bookkeeping on the phone: which server row each record is, whether
 * the server has its latest edit, deletions still to send, and how far this
 * phone has pulled. The sync engine (features/sync/engine.ts) is the only user.
 */
import {
  rowToTransaction,
  type Transaction,
  type TransactionRow,
} from '../../features/transactions/model';
import type { CategoryEntry, Preferences, ProviderEntry } from '../../features/sync/preferences';
import { MONEY_CATEGORIES, type MoneyCategory } from '../../types/domain';
import type { SqlDatabase } from '../client';

type SyncRow = TransactionRow & { sync_id: string | null; synced_edit: string | null };

export interface LocalRecord {
  transaction: Transaction;
  /** The server row it is, once it has been sent or received. */
  syncId: string | null;
  /** The edit time the server last had from this phone, or sent to it. */
  syncedEdit: string | null;
}

/** 'account': who this phone syncs with. 'key': a tag of their key. 'pulled_to': a PullCursor. */
export type SyncStateKey = 'account' | 'key' | 'pulled_to';

const toLocal = (row: SyncRow): LocalRecord => ({
  transaction: rowToTransaction(row),
  syncId: row.sync_id,
  syncedEdit: row.synced_edit,
});

/** Changed since the server last had it: never sent, or edited since. */
export const isUnsent = (r: LocalRecord): boolean => r.syncedEdit !== r.transaction.updatedAt;

const UNSENT = `is_demo = 0 AND (synced_edit IS NULL OR synced_edit != updated_at)`;

export const syncRepository = {
  async getState(db: SqlDatabase, key: SyncStateKey): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_state WHERE key = ?',
      [key],
    );
    return row?.value ?? null;
  },

  async setState(db: SqlDatabase, key: SyncStateKey, value: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO sync_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  },

  /** Records the server lacks or has an older edit of. Demo samples never go. */
  async listUnsent(db: SqlDatabase): Promise<LocalRecord[]> {
    const rows = await db.getAllAsync<SyncRow>(
      `SELECT * FROM transactions WHERE ${UNSENT} ORDER BY updated_at ASC, id ASC`,
    );
    return rows.map(toLocal);
  },

  async findBySyncId(db: SqlDatabase, syncId: string): Promise<LocalRecord | null> {
    const row = await db.getFirstAsync<SyncRow>('SELECT * FROM transactions WHERE sync_id = ?', [
      syncId,
    ]);
    return row ? toLocal(row) : null;
  },

  /** The real record with this transaction ID, if any. */
  async findByKey(db: SqlDatabase, transactionKey: string): Promise<LocalRecord | null> {
    const row = await db.getFirstAsync<SyncRow>(
      'SELECT * FROM transactions WHERE transaction_key = ? AND is_demo = 0 LIMIT 1',
      [transactionKey],
    );
    return row ? toLocal(row) : null;
  },

  /**
   * The server accepted this record as row `syncId`, at edit `edit`. If the
   * record changed meanwhile it stays unsent; if it was deleted meanwhile, the
   * deletion is queued so the row does not outlive it.
   */
  async markSent(db: SqlDatabase, id: string, syncId: string, edit: string): Promise<void> {
    await db.runAsync('UPDATE transactions SET sync_id = ? WHERE id = ? AND sync_id IS NULL', [
      syncId,
      id,
    ]);
    await db.runAsync('UPDATE transactions SET synced_edit = ? WHERE id = ? AND updated_at = ?', [
      edit,
      id,
      edit,
    ]);
    const still = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE id = ?',
      [id],
    );
    if (!still?.n) {
      await db.runAsync(
        `INSERT OR REPLACE INTO sync_deletions (sync_id, deleted_at)
         VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
        [syncId],
      );
    }
  },

  /** The record now matches row `syncId` at edit `edit` (its updated_at is already `edit`). */
  async markReceived(db: SqlDatabase, id: string, syncId: string, edit: string): Promise<void> {
    await db.runAsync('UPDATE transactions SET sync_id = ?, synced_edit = ? WHERE id = ?', [
      syncId,
      edit,
      id,
    ]);
  },

  /** Ties a record saved here to the row another phone sent for the same transaction. */
  async link(db: SqlDatabase, id: string, syncId: string): Promise<void> {
    await db.runAsync('UPDATE transactions SET sync_id = ? WHERE id = ?', [syncId, id]);
  },

  /**
   * Whether the record arrived from another phone. Such a record takes its
   * server row's id as its own (engine.ts); a record saved here never does.
   */
  async receivedFromSync(db: SqlDatabase, id: string): Promise<boolean> {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE id = ? AND sync_id = id',
      [id],
    );
    return (row?.n ?? 0) > 0;
  },

  async countSynced(db: SqlDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE sync_id IS NOT NULL',
    );
    return row?.n ?? 0;
  },

  /** Changes and deletions still to send. */
  async countPending(db: SqlDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM transactions WHERE ${UNSENT})
            + (SELECT COUNT(*) FROM sync_deletions) AS n`,
    );
    return row?.n ?? 0;
  },

  async listDeletions(db: SqlDatabase): Promise<{ syncId: string; deletedAt: string }[]> {
    return db.getAllAsync<{ syncId: string; deletedAt: string }>(
      'SELECT sync_id AS syncId, deleted_at AS deletedAt FROM sync_deletions ORDER BY deleted_at',
    );
  },

  async clearDeletion(db: SqlDatabase, syncId: string): Promise<void> {
    await db.runAsync('DELETE FROM sync_deletions WHERE sync_id = ?', [syncId]);
  },

  /**
   * Forget what the server had: nothing pulled, no deletions to send, every
   * record to send again. For a new account key, or another account.
   */
  async startOver(db: SqlDatabase): Promise<void> {
    await db.runAsync('DELETE FROM sync_deletions');
    await db.runAsync('UPDATE transactions SET synced_edit = NULL');
    await db.runAsync(`DELETE FROM sync_state WHERE key = 'pulled_to'`);
    await db.runAsync('DELETE FROM category_rule_deletions');
  },

  /** This phone's remembered categories, forgotten ones included, and its provider choices. */
  async readPreferences(db: SqlDatabase): Promise<Preferences> {
    const rules = await db.getAllAsync<{
      party_key: string;
      money_category: string;
      updated_at: string;
    }>('SELECT party_key, money_category, updated_at FROM category_rules');
    const forgotten = await db.getAllAsync<{ party_key: string; deleted_at: string }>(
      'SELECT party_key, deleted_at FROM category_rule_deletions',
    );
    // Only choices the user made: a provider never touched keeps its default.
    const providers = await db.getAllAsync<{ id: string; enabled: number; enabled_at: string }>(
      'SELECT id, enabled, enabled_at FROM providers WHERE enabled_at IS NOT NULL',
    );

    const categories: Preferences['categories'] = {};
    for (const f of forgotten) categories[f.party_key] = { category: null, at: f.deleted_at };
    for (const r of rules) {
      if (!(MONEY_CATEGORIES as readonly string[]).includes(r.money_category)) continue;
      const known = categories[r.party_key];
      if (!known || r.updated_at > known.at) {
        categories[r.party_key] = { category: r.money_category as MoneyCategory, at: r.updated_at };
      }
    }

    const choices: Preferences['providers'] = {};
    for (const p of providers) choices[p.id] = { enabled: p.enabled === 1, at: p.enabled_at };
    return { categories, providers: choices };
  },

  /** Take a category from another phone, keeping the time it was made there. */
  async applyCategory(db: SqlDatabase, key: string, entry: CategoryEntry): Promise<void> {
    if (entry.category === null) {
      await db.runAsync('DELETE FROM category_rules WHERE party_key = ?', [key]);
      await db.runAsync(
        'INSERT OR REPLACE INTO category_rule_deletions (party_key, deleted_at) VALUES (?, ?)',
        [key, entry.at],
      );
      return;
    }
    await db.runAsync(
      `INSERT INTO category_rules (party_key, money_category, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(party_key) DO UPDATE SET
         money_category = excluded.money_category, updated_at = excluded.updated_at`,
      [key, entry.category, entry.at],
    );
    await db.runAsync('DELETE FROM category_rule_deletions WHERE party_key = ?', [key]);
  },

  /** Take a provider choice from another phone. False for a provider this phone lacks. */
  async applyProvider(db: SqlDatabase, id: string, entry: ProviderEntry): Promise<boolean> {
    const r = await db.runAsync('UPDATE providers SET enabled = ? WHERE id = ?', [
      entry.enabled ? 1 : 0,
      id,
    ]);
    // After the trigger stamped it with this phone's clock.
    await db.runAsync('UPDATE providers SET enabled_at = ? WHERE id = ?', [entry.at, id]);
    return r.changes > 0;
  },
};
