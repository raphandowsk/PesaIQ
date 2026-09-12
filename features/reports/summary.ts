/**
 * The monthly summary: what came in, what was spent, fees and taxes, and net,
 * for a period, each compared with the period before it.
 *
 * Pure, and built from the same per-record arithmetic as Home (spent + fees &
 * taxes = total out), so a report can never disagree with the app. Ignored and
 * failed records are left out, as they are from every total.
 */
import { categoryOf } from '../insights/categories';
import { chargeLines } from '../insights/fees';
import { chargesOf, spentOf } from '../transactions/money';
import type { Transaction } from '../transactions/model';
import { recordDate } from '../transactions/records';
import { isCounted } from '../transactions/selectors';
import { isIncoming, isOutgoing } from '../../types/domain';
import { previousPeriod, resolvePeriod, type ReportPeriod, type ResolvedPeriod } from './period';

export interface ReportTotals {
  received: number;
  /** What outgoing money paid for. */
  spent: number;
  /** Fees and taxes. */
  charges: number;
  /** received - spent - charges */
  net: number;
  /** Counted records in the period. */
  count: number;
}

export interface ReportLine {
  key: string;
  label: string;
  amount: number;
  /** The same line in the period before. */
  previous: number;
  /** Share of this section's total, 0-1. */
  share: number;
  /** Records contributing in this period. */
  count: number;
}

export interface MonthlyReport {
  period: ResolvedPeriod;
  previous: ResolvedPeriod;
  totals: ReportTotals;
  previousTotals: ReportTotals;
  spending: ReportLine[];
  income: ReportLine[];
  /** Fees and taxes by type. */
  fees: ReportLine[];
  /** Records in the period still waiting for review: totals may change. */
  needsReview: number;
  /** Invented demo records in the period, flagged wherever the report is shown. */
  demoCount: number;
}

export interface Change {
  delta: number;
  /** Relative change, or null when there was nothing before to compare with. */
  pct: number | null;
}

const cents = (n: number) => Math.round(n * 100) / 100;

const inside = (t: Transaction, p: ResolvedPeriod) => {
  const d = recordDate(t);
  return d >= p.from && d < p.to;
};

function totalsOf(records: readonly Transaction[]): ReportTotals {
  let received = 0;
  let spent = 0;
  let charges = 0;
  for (const t of records) {
    charges += chargesOf(t);
    if (t.amount == null) continue;
    if (isIncoming(t.type)) received += t.amount;
    else if (isOutgoing(t.type)) spent += spentOf(t);
  }
  return {
    received: cents(received),
    spent: cents(spent),
    charges: cents(charges),
    net: cents(received - spent - charges),
    count: records.length,
  };
}

type Pick = (t: Transaction) => { key: string; label: string; amount: number }[];

const bySpending: Pick = (t) =>
  isOutgoing(t.type) && t.amount != null
    ? [{ key: categoryOf(t), label: categoryOf(t), amount: spentOf(t) }]
    : [];
const byIncome: Pick = (t) =>
  isIncoming(t.type) && t.amount != null
    ? [{ key: categoryOf(t), label: categoryOf(t), amount: t.amount }]
    : [];
const byFee: Pick = (t) => chargeLines(t);

function sum(records: readonly Transaction[], pick: Pick) {
  const groups = new Map<string, { label: string; amount: number; count: number }>();
  for (const t of records) {
    for (const line of pick(t)) {
      const g = groups.get(line.key) ?? { label: line.label, amount: 0, count: 0 };
      g.amount += line.amount;
      g.count += 1;
      groups.set(line.key, g);
    }
  }
  return groups;
}

/**
 * Lines for a section: everything this period, plus anything that stopped since
 * the period before (a category dropping to nothing is worth seeing). Largest
 * first.
 */
function lines(
  current: readonly Transaction[],
  before: readonly Transaction[],
  pick: Pick,
): ReportLine[] {
  const now = sum(current, pick);
  const then = sum(before, pick);
  const total = [...now.values()].reduce((s, g) => s + g.amount, 0);

  return [...new Set([...now.keys(), ...then.keys()])]
    .map((key) => {
      const g = now.get(key);
      const amount = cents(g?.amount ?? 0);
      return {
        key,
        label: g?.label ?? then.get(key)!.label,
        amount,
        previous: cents(then.get(key)?.amount ?? 0),
        share: total > 0 ? amount / total : 0,
        count: g?.count ?? 0,
      };
    })
    .sort(
      (a, b) => b.amount - a.amount || b.previous - a.previous || a.label.localeCompare(b.label),
    );
}

export function buildReport(
  transactions: readonly Transaction[],
  period: ReportPeriod,
): MonthlyReport {
  const current = resolvePeriod(period);
  const previous = resolvePeriod(previousPeriod(period));
  const counted = transactions.filter(isCounted);
  const now = counted.filter((t) => inside(t, current));
  const before = counted.filter((t) => inside(t, previous));

  return {
    period: current,
    previous,
    totals: totalsOf(now),
    previousTotals: totalsOf(before),
    spending: lines(now, before, bySpending),
    income: lines(now, before, byIncome),
    fees: lines(now, before, byFee),
    needsReview: now.filter((t) => t.status === 'NEEDS_REVIEW').length,
    demoCount: now.filter((t) => t.isDemo).length,
  };
}

export function changeOf(current: number, previous: number): Change {
  const delta = cents(current - previous);
  return { delta, pct: previous !== 0 ? delta / Math.abs(previous) : null };
}
