/**
 * Fees and taxes paid, for Home's card and the Fees & taxes screen.
 *
 * Everywhere in the app, operator fees + taxes = fees & taxes. Operator fees
 * are what the provider or agent charged, less any VAT inside the fee; that
 * VAT is counted once, under taxes. Each record's charges are split into lines
 * (operator fees, then each tax) that add up exactly to `chargesOf`, so the
 * breakdown and the total can never disagree.
 */
import { chargesOf, feeBeforeTaxOf } from '../transactions/money';
import type { Transaction } from '../transactions/model';
import { recordDate } from '../transactions/records';
import { isCounted } from '../transactions/selectors';
import { TAX_LABELS } from '../../types/domain';
import { formatTzs } from '../../utils/format';
import { UNRECOGNIZED_PROVIDER } from './providers';

export const OPERATOR_FEES_LABEL = 'Operator fees';

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
  // A cash withdrawal's agent fee is an operator fee too.
  const fee = feeBeforeTaxOf(t);
  if (fee > 0) lines.push({ key: 'OPERATOR_FEE', label: OPERATOR_FEES_LABEL, amount: fee });
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
  /** The total as operator fees + taxes. */
  split: ChargeSplit;
}

export interface ChargeSplit {
  /** What providers and agents charged, less any VAT inside the fee. */
  operatorFees: number;
  /** Every tax line: VAT, excise, levies, EWURA, REA. */
  taxes: number;
  /** operatorFees + taxes: fees & taxes. */
  total: number;
  /** The taxes by kind, largest first. */
  taxLines: ChargeLine[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Fees & taxes as operator fees + taxes, over any set of records. Callers pick
 * the records: one for a Detail screen, the counted ones for a total.
 */
export function splitCharges(records: readonly Transaction[]): ChargeSplit {
  let operatorFees = 0;
  let taxes = 0;
  const byTax = new Map<string, ChargeLine>();
  for (const t of records) {
    operatorFees += feeBeforeTaxOf(t);
    for (const tax of t.taxes) {
      taxes += tax.amount;
      const line = byTax.get(tax.code) ?? { key: tax.code, label: TAX_LABELS[tax.code], amount: 0 };
      line.amount += tax.amount;
      byTax.set(tax.code, line);
    }
  }
  return {
    operatorFees: cents(operatorFees),
    taxes: cents(taxes),
    total: cents(cents(operatorFees) + cents(taxes)),
    taxLines: [...byTax.values()]
      .map((l) => ({ ...l, amount: cents(l.amount) }))
      .sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label)),
  };
}

/** "Operator fees TZS 419 + Taxes TZS 76 = Fees & taxes TZS 495" */
export function chargesEquation(split: Pick<ChargeSplit, 'operatorFees' | 'taxes' | 'total'>) {
  return `${OPERATOR_FEES_LABEL} ${formatTzs(split.operatorFees)} + Taxes ${formatTzs(split.taxes)} = Fees & taxes ${formatTzs(split.total)}`;
}

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
    split: splitCharges(records),
  };
}
