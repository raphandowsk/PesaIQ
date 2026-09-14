/**
 * Dates and times as Tanzanian messages write them:
 *
 *   "Tarehe 21/6/13 saa 11:07 AM"   (historical M-Pesa: day first, 12-hour)
 *   "12/09/26 16:00"                (Mixx)
 *   "wakati 2025/03/29 13:32:54"    (HaloPesa: year first)
 *   "Date 23 June 2025, 11:59"      (M-Pesa receipt)
 *
 * Day-first is the Tanzanian convention; a month-first message would be
 * misread, which is a known limitation. A date that cannot exist is dropped
 * with a warning rather than guessed.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_WORD = String.raw`(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;

/** A clock reading after a date, optionally introduced by "saa" or "at". */
const CLOCK = String.raw`(?:\s*,?\s*(?:saa|at)?\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?)?`;

const YEAR_FIRST = new RegExp(String.raw`\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b${CLOCK}`, 'g');
const DAY_FIRST = new RegExp(String.raw`\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b${CLOCK}`, 'g');
const WORDED = new RegExp(String.raw`\b(\d{1,2})[\s-]+${MONTH_WORD}[\s-]+(\d{4})\b${CLOCK}`, 'gi');
const ANY_CLOCK = /\b(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([AaPp][Mm]))?\b/g;

export interface TzDateTime {
  /** "2013-06-21". */
  date: string | null;
  /** "11:07", 24-hour. */
  time: string | null;
  warning?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > new Date(year, month, 0).getDate()) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** "7:52 PM" → "19:52"; null for a time that cannot exist. */
export function clockTime(h: string, m: string, meridiem?: string): string | null {
  let hour = Number(h);
  const minute = Number(m);
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toUpperCase() === 'PM';
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour > 23) {
    return null;
  }
  return `${pad(hour)}:${pad(minute)}`;
}

const twoDigitYear = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));
const monthOf = (word: string) =>
  MONTHS.findIndex((m) => m.toLowerCase() === word.slice(0, 3).toLowerCase()) + 1;

export function extractTzDateTime(text: string): TzDateTime {
  let sawDate = false;
  const readers: [RegExp, (m: RegExpMatchArray) => string | null][] = [
    [YEAR_FIRST, (m) => isoDate(Number(m[1]), Number(m[2]), Number(m[3]))],
    [DAY_FIRST, (m) => isoDate(twoDigitYear(m[3]), Number(m[2]), Number(m[1]))],
    [WORDED, (m) => isoDate(Number(m[3]), monthOf(m[2]), Number(m[1]))],
  ];

  for (const [pattern, read] of readers) {
    for (const m of text.matchAll(pattern)) {
      sawDate = true;
      const date = read(m);
      if (!date) continue;
      const time = m[4] != null ? clockTime(m[4], m[5], m[6]) : firstClock(text);
      return { date, time };
    }
  }

  return {
    date: null,
    time: firstClock(text),
    warning: sawDate
      ? 'The date in the message is not a real date - capture time will be used instead.'
      : 'No date in the message - capture time will be used instead.',
  };
}

function firstClock(text: string): string | null {
  for (const m of text.matchAll(ANY_CLOCK)) {
    const time = clockTime(m[1], m[2], m[3]);
    if (time) return time;
  }
  return null;
}

/** "2013-08-08T19:52:00", "2013-08-08", or null. */
export function transactionAt(dt: TzDateTime): string | null {
  if (!dt.date) return null;
  return dt.time ? `${dt.date}T${dt.time}:00` : dt.date;
}

/** "2013-08-08" → "08 Aug 2013", the way the app writes dates. */
export function displayDate(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : null;
}
