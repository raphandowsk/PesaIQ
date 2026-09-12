/**
 * The user's category choice for each recipient, so the next message to the
 * same recipient is filed the same way.
 *
 * Keys are `partyKey(counterparty)`: names, so this table is personal data.
 * It is deleted along with the records, and Settings can clear it on its own.
 */
import { MONEY_CATEGORIES, type MoneyCategory } from '../../types/domain';
import type { SqlDatabase } from '../client';

export const categoryRuleRepository = {
  async list(db: SqlDatabase): Promise<Record<string, MoneyCategory>> {
    const rows = await db.getAllAsync<{ party_key: string; money_category: string }>(
      'SELECT party_key, money_category FROM category_rules',
    );
    const rules: Record<string, MoneyCategory> = {};
    for (const row of rows) {
      if ((MONEY_CATEGORIES as readonly string[]).includes(row.money_category)) {
        rules[row.party_key] = row.money_category as MoneyCategory;
      }
    }
    return rules;
  },

  async set(db: SqlDatabase, key: string, category: MoneyCategory, now: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO category_rules (party_key, money_category, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(party_key) DO UPDATE SET
         money_category = excluded.money_category, updated_at = excluded.updated_at`,
      [key, category, now],
    );
  },

  async removeAll(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync('DELETE FROM category_rules');
    return r.changes;
  },
};
