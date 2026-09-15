/**
 * This week's spending, day by day: Home's weekly bar chart.
 *
 * Monday to Sunday, local time, the same week "cleared this week" counts. A
 * record is filed on the day its message gives (or the day it was saved, when
 * the message carried no date) and counts what the money bought, as Spent
 * does: fees and taxes are shown apart.
 */
import { spentOf } from '../transactions/money';
import type { Transaction } from '../transactions/model';
import { recordDate } from '../transactions/records';
import { isCounted } from '../transactions/selectors';
import { isOutgoing } from '../../types/domain';
import { localDayKey } from './streak';

/** Monday 00:00, local time: the start of "this week". */
export function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export interface WeekDay {
  /** The chart's label: "M", "T", … */
  short: string;
  /** "Monday": what a screen reader says. */
  name: string;
  amount: number;
  isToday: boolean;
  /** Later this week: nothing can have been spent yet. */
  isFuture: boolean;
}

export interface WeekSpending {
  /** Seven days, Monday first. */
  days: WeekDay[];
  total: number;
  /** The largest day, to scale the bars. Zero when nothing was spent. */
  max: number;
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const cents = (n: number) => Math.round(n * 100) / 100;

export function weekSpending(transactions: readonly Transaction[], now: Date): WeekSpending {
  const start = startOfWeek(now);
  const today = localDayKey(now);
  const keys = DAY_NAMES.map((_, i) =>
    localDayKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );

  const byDay = new Map<string, number>(keys.map((k) => [k, 0]));
  for (const t of transactions) {
    if (!isCounted(t) || !isOutgoing(t.type) || t.amount == null) continue;
    const key = localDayKey(recordDate(t));
    const sofar = byDay.get(key);
    if (sofar !== undefined) byDay.set(key, sofar + spentOf(t));
  }

  const days = DAY_NAMES.map((name, i) => ({
    short: name[0],
    name,
    amount: cents(byDay.get(keys[i]) ?? 0),
    isToday: keys[i] === today,
    // YYYY-MM-DD keys sort as dates.
    isFuture: keys[i] > today,
  }));

  return {
    days,
    total: cents(days.reduce((sum, d) => sum + d.amount, 0)),
    max: Math.max(0, ...days.map((d) => d.amount)),
  };
}
