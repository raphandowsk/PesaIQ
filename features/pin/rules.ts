/**
 * The PIN's rules: four digits, not one of the few everyone tries first, and
 * five free tries before the server makes people wait.
 */
export const PIN_LENGTH = 4;
export const FREE_TRIES = 5;

const HARDER = "Choose a PIN that's harder to guess";

/** What is wrong with a new PIN, or null when it can be used. */
export function pinProblem(pin: string): string | null {
  if (!/^\d{4}$/.test(pin)) return 'Enter 4 digits.';
  if (/^(\d)\1{3}$/.test(pin)) return `${HARDER} than four of the same digit.`;
  const d = [...pin].map(Number);
  const rising = d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const falling = d.every((x, i) => i === 0 || x === d[i - 1] - 1);
  if (rising || falling) return `${HARDER} than a run like 1234.`;
  if (pin.slice(0, 2) === pin.slice(2)) return `${HARDER} than a repeated pair like 1212.`;
  return null;
}

/** Tries left before a wait, after `failures` guesses the server has counted. */
export const triesLeft = (failures: number): number => Math.max(0, FREE_TRIES - failures);

/** "Try again in 5 minutes." for a wait ending at `retryAt`. */
export function retryText(retryAt: string, now: number): string {
  const ms = Date.parse(retryAt) - now;
  if (!(ms > 0)) return 'You can try again now.';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `Try again in ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
  return 'Try again tomorrow.';
}
