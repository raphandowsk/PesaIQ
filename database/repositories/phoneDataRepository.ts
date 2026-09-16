/**
 * Everything PesaIQ keeps on this phone, erased: after Delete account, so the
 * phone is left as a fresh install would be.
 *
 * Children before parents, so foreign keys never block a delete. Deleting
 * records and categories queues sync deletions and remembered-forget rows
 * through triggers; those tables are cleared after them.
 */
import type { SqlDatabase } from '../client';

const TABLES_IN_ORDER = [
  'transactions',
  'parse_results',
  'messages',
  'processing_events',
  'category_rules',
  'category_rule_deletions',
  'sync_deletions',
  'sync_state',
  'settings',
  'providers',
] as const;

export const phoneDataRepository = {
  /** Every row of every table. Run inside a transaction. */
  async eraseAll(db: SqlDatabase): Promise<void> {
    for (const table of TABLES_IN_ORDER) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  },
};
