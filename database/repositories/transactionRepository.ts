/**
 * Transaction persistence.
 *
 * All SQL touching `transactions` lives here — screens never write queries.
 * Every method takes the database explicitly so a caller can pass a test
 * database without any global state.
 */
import {
  rowToTransaction,
  TRANSACTION_COLUMNS,
  transactionToParams,
  type Transaction,
  type TransactionRow,
} from '../../features/transactions/model';
import type { TransactionStatus, TransactionType } from '../../types/domain';
import type { SqlDatabase, SqlParam } from '../client';

const SELECT = `SELECT * FROM transactions`;

export interface TransactionFilter {
  status?: TransactionStatus;
  types?: TransactionType[];
  /** Matches counterparty, reference, provider or masked identifier. */
  search?: string;
  includeDemo?: boolean;
  limit?: number;
}

export const transactionRepository = {
  async insert(db: SqlDatabase, t: Transaction): Promise<Transaction> {
    const placeholders = TRANSACTION_COLUMNS.map(() => '?').join(', ');
    await db.runAsync(
      `INSERT INTO transactions (${TRANSACTION_COLUMNS.join(', ')}) VALUES (${placeholders})`,
      transactionToParams(t),
    );
    return t;
  },

  async findById(db: SqlDatabase, id: string): Promise<Transaction | null> {
    const row = await db.getFirstAsync<TransactionRow>(`${SELECT} WHERE id = ?`, [id]);
    return row ? rowToTransaction(row) : null;
  },

  /** Newest first. */
  async list(db: SqlDatabase, filter: TransactionFilter = {}): Promise<Transaction[]> {
    const where: string[] = [];
    const params: SqlParam[] = [];

    if (filter.status) {
      where.push('status = ?');
      params.push(filter.status);
    }

    if (filter.types?.length) {
      where.push(`type IN (${filter.types.map(() => '?').join(', ')})`);
      params.push(...filter.types);
    }

    if (filter.includeDemo === false) where.push('is_demo = 0');

    if (filter.search?.trim()) {
      // LIKE is enough at this scale and avoids an FTS table to maintain.
      where.push(
        `(COALESCE(counterparty,'') LIKE ? OR COALESCE(transaction_reference,'') LIKE ?` +
          ` OR COALESCE(provider,'') LIKE ? OR COALESCE(masked_account_or_phone,'') LIKE ?)`,
      );
      const needle = `%${filter.search.trim()}%`;
      params.push(needle, needle, needle, needle);
    }

    const sql =
      `${SELECT}` +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ` ORDER BY created_at DESC` +
      (filter.limit ? ` LIMIT ${Number(filter.limit)}` : '');

    const rows = await db.getAllAsync<TransactionRow>(sql, params);
    return rows.map(rowToTransaction);
  },

  async update(
    db: SqlDatabase,
    id: string,
    patch: Partial<Transaction>,
    now: string,
  ): Promise<Transaction | null> {
    const existing = await this.findById(db, id);
    if (!existing) return null;

    const merged: Transaction = { ...existing, ...patch, id, updatedAt: now };

    await db.runAsync(
      `UPDATE transactions SET
         type = ?, status = ?, provider = ?, provider_id = ?, amount = ?, currency = ?,
         counterparty = ?, masked_account_or_phone = ?, transaction_reference = ?,
         balance_after = ?, transaction_date = ?, transaction_time = ?, confidence = ?,
         low_fields = ?, source_message_id = ?, parse_result_id = ?, is_demo = ?,
         money_category = ?, fee = ?, taxes = ?, details = ?,
         transaction_key = ?, duplicate_of = ?,
         updated_at = ?
       WHERE id = ?`,
      [
        merged.type,
        merged.status,
        merged.provider,
        merged.providerId,
        merged.amount,
        merged.currency,
        merged.counterparty,
        merged.maskedAccountOrPhone,
        merged.transactionReference,
        merged.balanceAfter,
        merged.transactionDate,
        merged.transactionTime,
        merged.confidence,
        JSON.stringify(merged.lowFields),
        merged.sourceMessageId,
        merged.parseResultId,
        merged.isDemo ? 1 : 0,
        merged.moneyCategory,
        merged.fee,
        JSON.stringify(merged.taxes),
        JSON.stringify(merged.details),
        merged.transactionKey ?? null,
        merged.duplicateOf ?? null,
        merged.updatedAt,
        id,
      ],
    );

    return merged;
  },

  async remove(db: SqlDatabase, id: string): Promise<boolean> {
    const r = await db.runAsync('DELETE FROM transactions WHERE id = ?', [id]);
    return r.changes > 0;
  },

  /** How many records point at a source message, so it is only deleted when none do. */
  async countBySourceMessage(db: SqlDatabase, messageId: string): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE source_message_id = ?',
      [messageId],
    );
    return row?.n ?? 0;
  },

  async removeAll(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync('DELETE FROM transactions');
    return r.changes;
  },

  /** Used by "Remove demo data", which must leave real records untouched. */
  async removeDemo(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync('DELETE FROM transactions WHERE is_demo = 1');
    return r.changes;
  },

  async countByStatus(db: SqlDatabase, status: TransactionStatus): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) AS n FROM transactions WHERE status = ?',
      [status],
    );
    return row?.n ?? 0;
  },

  /**
   * The real record with this transaction ID (transactionKey.ts), if any.
   * Demo samples never count, and `exceptId` leaves out the record being edited.
   */
  async findByKey(db: SqlDatabase, key: string, exceptId?: string): Promise<Transaction | null> {
    if (!key) return null;
    const row = await db.getFirstAsync<TransactionRow>(
      `${SELECT} WHERE transaction_key = ? AND is_demo = 0 AND id != ? LIMIT 1`,
      [key, exceptId ?? ''],
    );
    return row ? rowToTransaction(row) : null;
  },

  /** Records marked as repeating this one, oldest first. */
  async listCopiesOf(db: SqlDatabase, id: string): Promise<Transaction[]> {
    const rows = await db.getAllAsync<TransactionRow>(
      `${SELECT} WHERE duplicate_of = ? ORDER BY created_at ASC, id ASC`,
      [id],
    );
    return rows.map(rowToTransaction);
  },
};
