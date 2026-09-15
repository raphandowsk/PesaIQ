/**
 * Spending and income grouped by what the money was for.
 *
 * A record's category is the one saved on it (picked by the parser, corrected
 * by the user). Records saved before categories existed are filed by the same
 * rules, from their type and counterparty.
 */
import { inferMoneyCategory } from '../parser/moneyCategory';
import { spentOf } from '../transactions/money';
import type { Transaction } from '../transactions/model';
import { isCounted } from '../transactions/selectors';
import {
  isIncoming,
  isOutgoing,
  MONEY_CATEGORY_LABELS,
  type MoneyCategory,
} from '../../types/domain';

export type CategoryMode = 'spend' | 'earn';

/** The record's category, or the rules' pick for a record saved without one. */
export function moneyCategoryOf(t: Transaction): MoneyCategory {
  return (
    t.moneyCategory ??
    inferMoneyCategory({
      type: t.type,
      counterparty: t.counterparty,
      merchant: t.details.merchant,
    }) ??
    (isIncoming(t.type) ? 'OTHER_INCOME' : 'OTHER_SPENDING')
  );
}

export function categoryOf(t: Transaction): string {
  return MONEY_CATEGORY_LABELS[moneyCategoryOf(t)];
}

export interface CategoryRow {
  name: string;
  amount: number;
  count: number;
  /** Share of the total, 0-100, rounded. */
  pct: number;
}

export interface CategoryBreakdown {
  mode: CategoryMode;
  /** The real total. (The prototype shows 1 for an empty list.) */
  total: number;
  /** Largest first. */
  rows: CategoryRow[];
}

/**
 * Spending counts what the money bought; fees and taxes are shown on their own
 * (Home's Fees & taxes card), not folded into a category.
 */
export function categoryBreakdown(
  transactions: readonly Transaction[],
  mode: CategoryMode,
): CategoryBreakdown {
  const include = mode === 'spend' ? isOutgoing : isIncoming;
  const groups = new Map<string, { amount: number; count: number }>();

  for (const t of transactions) {
    if (!isCounted(t) || !include(t.type)) continue;
    const name = categoryOf(t);
    const group = groups.get(name) ?? { amount: 0, count: 0 };
    group.amount += mode === 'spend' ? spentOf(t) : (t.amount ?? 0);
    group.count += 1;
    groups.set(name, group);
  }

  const total = Math.round([...groups.values()].reduce((sum, g) => sum + g.amount, 0) * 100) / 100;

  const rows = [...groups.entries()]
    .map(([name, g]) => ({
      name,
      amount: Math.round(g.amount * 100) / 100,
      count: g.count,
      pct: total > 0 ? Math.round((g.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  return { mode, total, rows };
}

/** The name of the row `topCategories` folds the smaller categories into. */
export const EVERYTHING_ELSE = 'Everything else';

/**
 * The largest `keep` categories, and the rest folded into one "Everything
 * else": Home's split bar. A list only one longer than `keep` stays as it is,
 * since folding a single row would hide its name for nothing.
 */
export function topCategories(breakdown: CategoryBreakdown, keep = 3): CategoryRow[] {
  if (breakdown.rows.length <= keep + 1) return breakdown.rows;

  const rest = breakdown.rows.slice(keep);
  const amount = Math.round(rest.reduce((sum, r) => sum + r.amount, 0) * 100) / 100;
  return [
    ...breakdown.rows.slice(0, keep),
    {
      name: EVERYTHING_ELSE,
      amount,
      count: rest.reduce((sum, r) => sum + r.count, 0),
      pct: breakdown.total > 0 ? Math.round((amount / breakdown.total) * 100) : 0,
    },
  ];
}
