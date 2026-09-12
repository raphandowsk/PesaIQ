/**
 * Fees and taxes paid, for Home's card and the Fees & taxes screen.
 *
 * Each record's charges are split into lines - the provider's own fee (called
 * an agent fee on a cash withdrawal) and each tax - that add up exactly to
 * `chargesOf`, so the breakdown and the total can never disagree.
 */
import { chargesOf, feeBeforeTaxOf } from '../transactions/money';
import type { Transaction } from '../transactions/model';
import { recordDate } from '../transactions/records';
import { isCounted } from '../transactions/selectors';
import { TAX_LABELS } from '../../types/domain';
import { UNRECOGNIZED_PROVIDER } from './providers';

export type FeePeriod = 'month' | 'lastMonth' | 'all';

export const FEE_PERIODS: readonly { key: FeePeriod; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'all', label: 'All time' },
];

/** Calendar months in local time; `to` is exclusive. */
export function feePeriodRange(
  period: FeePeriod,
  now: Date,
): { from: Date | null; to: Date | null } {
  if (period === 'all') return { from: null, to: null };
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'month') return { from: thisMonth, to: null };
  return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: thisMonth };
}

export interface ChargeLine {
  key: string;
  label: string;
  amount: number;
}

/** One record's charges as lines that add up to `chargesOf(t)`. */
export function chargeLines(t: Transaction): ChargeLine[] {
  const lines: ChargeLine[] = [];
  const fee = feeBeforeTaxOf(t);
  if (fee > 0) {
    lines.push(
      t.type === 'WITHDRAWAL'
        ? { key: 'AGENT_FEE', label: 'Agent fees', amount: fee }
        : { key: 'FEE', label: 'Transaction fees', amount: fee },
    );
  }
  for (const tax of t.taxes) {
    lines.push({ key: tax.code, label: TAX_LABELS[tax.code], amount: tax.amount });
  }
  return lines;
}

export interface ChargeRow extends ChargeLine {
  /** Records contributing to the row. */
  count: number;
}

export interface FeesSummary {
  total: number;
  /** Records that carried any charge, newest first. */
  records: Transaction[];
  /** Largest first. */
  byType: ChargeRow[];
  byProvider: ChargeRow[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

function addTo(rows: Map<string, ChargeRow>, line: ChargeLine) {
  const row = rows.get(line.key) ?? { ...line, amount: 0, count: 0 };
  row.amount += line.amount;
  row.count += 1;
  rows.set(line.key, row);
}

const largestFirst = (rows: Map<string, ChargeRow>): ChargeRow[] =>
  [...rows.values()]
    .map((r) => ({ ...r, amount: cents(r.amount) }))
    .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

/** Ignored and failed records are left out, as they are from every total. */
export function feesSummary(
  transactions: readonly Transaction[],
  period: FeePeriod,
  now: Date,
): FeesSummary {
  const { from, to } = feePeriodRange(period, now);

  const records = transactions
    .filter((t) => isCounted(t) && chargesOf(t) > 0)
    .filter((t) => {
      const d = recordDate(t);
      return (!from || d >= from) && (!to || d < to);
    })
    .sort((a, b) => recordDate(b).getTime() - recordDate(a).getTime());

  const byType = new Map<string, ChargeRow>();
  const byProvider = new Map<string, ChargeRow>();
  let total = 0;

  for (const t of records) {
    const charges = chargesOf(t);
    total += charges;
    for (const line of chargeLines(t)) addTo(byType, line);
    const provider = t.provider ?? UNRECOGNIZED_PROVIDER;
    addTo(byProvider, { key: provider, label: provider, amount: charges });
  }

  return {
    total: cents(total),
    records,
    byType: largestFirst(byType),
    byProvider: largestFirst(byProvider),
  };
}
