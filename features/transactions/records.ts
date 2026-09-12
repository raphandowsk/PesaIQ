/**
 * The Records list: filtering, searching, ordering and grouping by day.
 *
 * Pure, so the rules are tested once and the screen only renders the result.
 * The type chips are the design's; provider and period are the brief's, kept
 * behind "More filters" so the design's own layout is unchanged by default.
 */
import { UNRECOGNIZED_PROVIDER } from '../insights/providers';
import { localDayKey } from '../insights/streak';
import type { TransactionStatus, TransactionType } from '../../types/domain';
import { formatAmount, formatShortDate } from '../../utils/format';
import type { Transaction } from './model';

export type RecordFilterKey = 'all' | 'received' | 'sent' | 'cashout' | 'bills' | 'review';

export interface RecordFilter {
  key: RecordFilterKey;
  label: string;
  types?: readonly TransactionType[];
  status?: TransactionStatus;
}

/** The design's chips, in its order. */
export const RECORD_FILTERS: readonly RecordFilter[] = [
  { key: 'all', label: 'All' },
  { key: 'received', label: 'Received', types: ['RECEIVED', 'DEPOSIT'] },
  { key: 'sent', label: 'Sent', types: ['SENT', 'TRANSFER'] },
  { key: 'cashout', label: 'Cash out', types: ['WITHDRAWAL'] },
  { key: 'bills', label: 'Bills', types: ['BILL_PAYMENT', 'AIRTIME'] },
  { key: 'review', label: 'Review', status: 'NEEDS_REVIEW' },
];

export type RecordPeriodKey = 'any' | '7d' | '30d' | 'year';

export const RECORD_PERIODS: readonly { key: RecordPeriodKey; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'year', label: 'This year' },
];

export interface RecordQuery {
  filter: RecordFilterKey;
  search: string;
  /** A provider name, or null for all of them. */
  provider: string | null;
  period: RecordPeriodKey;
}

export const DEFAULT_RECORD_QUERY: RecordQuery = {
  filter: 'all',
  search: '',
  provider: null,
  period: 'any',
};

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * When the transaction happened: the date and time the parser read from the
 * message ("12 Mar 2026", "14:22"), or when it was saved if the message
 * carried no date, or the user retyped it into something unreadable.
 */
export function recordDate(t: Transaction): Date {
  return parsedRecordDate(t) ?? new Date(t.createdAt);
}

/**
 * Only the date read from the message: null when it carried none, or it was
 * retyped into something unreadable. Export uses this, so a missing date stays
 * an empty cell instead of quietly becoming the day it was saved.
 */
export function parsedRecordDate(t: Transaction): Date | null {
  const m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/.exec((t.transactionDate ?? '').trim());
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS.indexOf(m[2].toLowerCase());
    const time = /^(\d{1,2}):(\d{2})$/.exec((t.transactionTime ?? '').trim());
    const d = new Date(
      Number(m[3]),
      month,
      day,
      time ? Number(time[1]) : 0,
      time ? Number(time[2]) : 0,
    );
    // Rejects impossible dates, which Date would otherwise roll over (31 Feb).
    if (month >= 0 && !Number.isNaN(d.getTime()) && d.getDate() === day) return d;
  }
  return null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** The first moment a period includes. "Last 7 days" counts today as one of them. */
export function periodStart(period: RecordPeriodKey, now: Date): Date | null {
  const d = startOfDay(now);
  switch (period) {
    case '7d':
      d.setDate(d.getDate() - 6);
      return d;
    case '30d':
      d.setDate(d.getDate() - 29);
      return d;
    case 'year':
      return new Date(now.getFullYear(), 0, 1);
    default:
      return null;
  }
}

/** What a search can match: name, reference, provider, masked number, amount. */
function searchText(t: Transaction): string {
  return [
    t.counterparty,
    t.transactionReference,
    t.provider,
    t.maskedAccountOrPhone,
    t.amount == null ? null : String(t.amount),
    t.amount == null ? null : formatAmount(t.amount),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Matching records, newest transaction first. */
export function filterRecords(
  transactions: readonly Transaction[],
  query: RecordQuery,
  now: Date,
): Transaction[] {
  const chip = RECORD_FILTERS.find((f) => f.key === query.filter) ?? RECORD_FILTERS[0];
  const needle = query.search.trim().toLowerCase();
  const from = periodStart(query.period, now);

  return transactions
    .filter((t) => {
      if (chip.status && t.status !== chip.status) return false;
      if (chip.types && !chip.types.includes(t.type)) return false;
      if (query.provider !== null && (t.provider ?? UNRECOGNIZED_PROVIDER) !== query.provider) {
        return false;
      }
      if (from && recordDate(t) < from) return false;
      if (needle && !searchText(t).includes(needle)) return false;
      return true;
    })
    .sort(
      (a, b) =>
        recordDate(b).getTime() - recordDate(a).getTime() || b.createdAt.localeCompare(a.createdAt),
    );
}

export interface RecordGroup {
  key: string;
  /** "12 Mar 2026", matching how the parser writes dates. */
  title: string;
  data: Transaction[];
}

/** One group per transaction day, in the order the days first appear. */
export function groupByDay(records: readonly Transaction[]): RecordGroup[] {
  const groups = new Map<string, RecordGroup>();
  for (const t of records) {
    const d = recordDate(t);
    const key = localDayKey(d);
    const group = groups.get(key) ?? { key, title: formatShortDate(d), data: [] };
    group.data.push(t);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Providers present in the records, most used first. */
export function providerOptions(transactions: readonly Transaction[]): string[] {
  const counts = new Map<string, number>();
  for (const t of transactions) {
    const name = t.provider ?? UNRECOGNIZED_PROVIDER;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

/** How many of the "More filters" are narrowing the list. */
export function extraFilterCount(query: RecordQuery): number {
  return (query.provider !== null ? 1 : 0) + (query.period !== 'any' ? 1 : 0);
}
