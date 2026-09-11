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
