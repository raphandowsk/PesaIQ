/**
 * The optional name Home greets the user by.
 *
 * Asked once during onboarding and changed in Settings. It stays on the phone;
 * with Cloud sync on it also travels inside the locked preferences document
 * (features/sync/preferences.ts), which the server cannot read.
 */

/** Room for a first name and more, short enough for Home's heading. */
export const NAME_MAX_LENGTH = 30;

const isControl = (c: string): boolean => {
  const code = c.charCodeAt(0);
  return code < 32 || code === 127;
};

/**
 * Trimmed, runs of spaces made one, control characters dropped, and cut to
 * `NAME_MAX_LENGTH` characters (whole characters, so an emoji is never split).
 * Null when nothing is left.
 */
export function cleanName(input: string | null | undefined): string | null {
  const chars = Array.from(input ?? '').map((c) => (isControl(c) ? ' ' : c));
  const cleaned = Array.from(chars.join('').replace(/\s+/g, ' ').trim())
    .slice(0, NAME_MAX_LENGTH)
    .join('')
    .trim();
  return cleaned || null;
}

/** Home's heading: "Welcome, Asha", or "Welcome back" without a name. */
export const welcomeLine = (name: string | null): string =>
  name ? `Welcome, ${name}` : 'Welcome back';
