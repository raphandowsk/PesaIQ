/**
 * Spending and income grouped into everyday categories, from the design's
 * `catOf`. The keyword rules look only at the counterparty, and only for
 * Tanzanian terms the design names (LUKU and UMEME for electricity; PAYROLL,
 * MSHAHARA and SALARY for pay).
 */
import type { Transaction } from '../transactions/model';
import { isCounted } from '../transactions/selectors';
import { isIncoming, isOutgoing } from '../../types/domain';

export type CategoryMode = 'spend' | 'earn';

export function categoryOf(t: Transaction): string {
  const party = (t.counterparty ?? '').toUpperCase();

  switch (t.type) {
    case 'AIRTIME':
      return 'Airtime & data';
    case 'WITHDRAWAL':
      return 'Cash withdrawals';
    case 'BILL_PAYMENT':
      return /LUKU|UMEME/.test(party) ? 'Electricity & LUKU' : 'Bills & fees';
    case 'SENT':
    case 'TRANSFER':
      return 'Payments to people';
    case 'DEPOSIT':
      return 'Deposits';
    case 'RECEIVED':
      return /PAYROLL|MSHAHARA|SALARY/.test(party) ? 'Salary' : 'Payments in';
    default:
      return 'Other';
  }
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
    group.amount += t.amount ?? 0;
    group.count += 1;
    groups.set(name, group);
  }

  const total = [...groups.values()].reduce((sum, g) => sum + g.amount, 0);

  const rows = [...groups.entries()]
    .map(([name, g]) => ({
      name,
      amount: g.amount,
      count: g.count,
      pct: total > 0 ? Math.round((g.amount / total) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));

  return { mode, total, rows };
}
