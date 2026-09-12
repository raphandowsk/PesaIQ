/**
 * Report periods: a calendar month, or a custom range of days.
 *
 * Local time throughout. `from` is the first moment included and `to` the first
 * moment after, so a range ends at midnight after its last day, and a month at
 * midnight on the 1st of the next.
 */

export type ReportPeriod =
  | { kind: 'month'; year: number; /** 0-11 */ month: number }
  | { kind: 'range'; from: Date; to: Date };

export interface ResolvedPeriod {
  from: Date;
  to: Date;
  label: string;
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const SHORT = MONTHS.map((m) => m.slice(0, 3));
const DAY_MS = 86_400_000;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
/** Whole days between two midnights, immune to daylight-saving shifts. */
const daysBetween = (a: Date, b: Date) =>
  Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) -
      Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      DAY_MS,
  );

export type MonthPeriod = Extract<ReportPeriod, { kind: 'month' }>;

export const monthOf = (d: Date): MonthPeriod => ({
  kind: 'month',
  year: d.getFullYear(),
  month: d.getMonth(),
});

export function shiftMonth(p: MonthPeriod, delta: number): MonthPeriod {
  const d = new Date(p.year, p.month + delta, 1);
  return { kind: 'month', year: d.getFullYear(), month: d.getMonth() };
}

/** A month after the current one has nothing in it yet. */
export function canGoForward(p: MonthPeriod, now: Date): boolean {
  return p.year < now.getFullYear() || (p.year === now.getFullYear() && p.month < now.getMonth());
}

/** "12 Sep 2026", "1–15 Sep 2026", "28 Aug – 3 Sep 2026", "28 Dec 2025 – 3 Jan 2026". */
export function rangeLabel(first: Date, last: Date): string {
  const day = (d: Date) => String(d.getDate());
  const full = (d: Date) => `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}`;
  if (daysBetween(first, last) === 0) return full(first);
  if (first.getFullYear() !== last.getFullYear()) return `${full(first)} – ${full(last)}`;
  if (first.getMonth() !== last.getMonth()) {
    return `${day(first)} ${SHORT[first.getMonth()]} – ${full(last)}`;
  }
  return `${day(first)}–${full(last)}`;
}

export function resolvePeriod(p: ReportPeriod): ResolvedPeriod {
  if (p.kind === 'month') {
    return {
      from: new Date(p.year, p.month, 1),
      to: new Date(p.year, p.month + 1, 1),
      label: `${MONTHS[p.month]} ${p.year}`,
    };
  }
  return { from: p.from, to: p.to, label: rangeLabel(p.from, addDays(p.to, -1)) };
}

/** What a period is compared with: the month before, or the same number of days just before. */
export function previousPeriod(p: ReportPeriod): ReportPeriod {
  if (p.kind === 'month') return shiftMonth(p, -1);
  const length = daysBetween(p.from, p.to);
  return { kind: 'range', from: addDays(p.from, -length), to: p.from };
}

/** A range covering both days in full; null when the last day is before the first. */
export function customRange(first: Date, last: Date): ReportPeriod | null {
  const from = startOfDay(first);
  const lastDay = startOfDay(last);
  if (lastDay < from) return null;
  return { kind: 'range', from, to: addDays(lastDay, 1) };
}

export type RangePreset = 'last7' | 'last30' | 'thisYear';

export const RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: 'last7', label: 'Last 7 days' },
  { key: 'last30', label: 'Last 30 days' },
  { key: 'thisYear', label: 'This year' },
];

/** Each preset ends with today. */
export function presetRange(preset: RangePreset, now: Date): ReportPeriod {
  const today = startOfDay(now);
  const first =
    preset === 'last7'
      ? addDays(today, -6)
      : preset === 'last30'
        ? addDays(today, -29)
        : new Date(today.getFullYear(), 0, 1);
  return { kind: 'range', from: first, to: addDays(today, 1) };
}

/**
 * A typed day, read day-first like the messages: "12/09/2026", "12-09-26",
 * "1.9.2026". Null for anything that is not a real date.
 */
export function parseDayInput(raw: string): Date | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\s*$/.exec(raw);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, month - 1, day);
  return month >= 1 && month <= 12 && d.getDate() === day && d.getMonth() === month - 1 ? d : null;
}

/** "12/09/2026": how a day is shown in the range inputs. */
export const formatDayInput = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
