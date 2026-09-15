/**
 * Money and name formatting.
 *
 * Grouping is done by hand rather than with `toLocaleString`. Hermes ships Intl,
 * but locale data varies by device and OS build, and a record list whose
 * separators shift between phones is a bug report waiting to happen.
 */

/** The typographic minus the design uses for outgoing amounts. */
export const MINUS = '−';

/** 1234567.5 -> "1,234,567.5"; whole numbers carry no decimals. */
export function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return '—';

  const [whole, fraction] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = fraction === '00' ? '' : `.${fraction.replace(/0$/, '')}`;

  return `${value < 0 ? MINUS : ''}${grouped}${cents}`;
}

/** Signed by direction, not by the number's own sign: "+250,000", "−45,000". */
export function formatSignedAmount(value: number | null, incoming: boolean): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${incoming ? '+' : MINUS}${formatAmount(Math.abs(value))}`;
}

const COMPACT_UNITS: readonly (readonly [string, number])[] = [
  ['K', 1e3],
  ['M', 1e6],
  ['B', 1e9],
];

/** Three significant figures at most, with trailing zeros dropped: 1.25, 45, 513. */
const shortNumber = (n: number): string =>
  n
    .toFixed(n < 10 ? 2 : n < 100 ? 1 : 0)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');

/** Short figures for chart labels: 950, 45K, 1.25M. Never "1000K": that is 1M. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? MINUS : '';
  const abs = Math.abs(value);
  if (Math.round(abs) < 1000) return `${sign}${Math.round(abs)}`;

  for (const [unit, size] of COMPACT_UNITS) {
    const text = shortNumber(abs / size);
    if (Number(text) < 1000 || unit === 'B') return `${sign}${text}${unit}`;
  }
  return formatAmount(value);
}

export function formatTzs(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : `TZS ${formatAmount(value)}`;
}

/**
 * Up to two initials for an avatar. Ported from the design's `initials` logic,
 * with the same fallback when a name has no letters in it.
 */
export function initials(name: string | null | undefined): string {
  const letters = (name ?? '')
    .replace(/[^A-Za-z ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return letters || 'NA';
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
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

/** "Friday, 11 September 2026": the dashboard's date line. Built by hand, like the amounts. */
export function formatLongDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "05 Mar 2026": the Records date headings, written the way the parser writes dates. */
export function formatShortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')} ${SHORT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
