/**
 * The send-sms hook's rules: which numbers it accepts, the message it sends,
 * and what the provider's answer means. No Deno APIs here, so the app's Jest
 * suite can test it.
 *
 * Provider: messaging-service.co.tz, Messaging Service API V2 (Internet SMS).
 */

/**
 * The sender name shown on the phone. MUST is lent to PesaIQ while its own
 * sender ID is being approved (2026-09-14); swap it here when that arrives.
 */
export const SENDER_ID = 'MUST';

export const LIVE_URL = 'https://messaging-service.co.tz/api/sms/v2/text/single';
/** Free: the provider answers with dummy data and sends nothing. */
export const TEST_URL = 'https://messaging-service.co.tz/api/sms/v2/test/text/single';

export type Mode = 'test' | 'live';

/** Anything but an explicit "live" goes to the provider's free test endpoint. */
export const modeFrom = (value: string | null | undefined): Mode =>
  value?.trim().toLowerCase() === 'live' ? 'live' : 'test';

/**
 * A Tanzanian mobile number as the provider wants it: 255, then nine digits
 * starting with 6 or 7. Accepts +255, spaces and the local 07... form.
 */
export function tanzanianMobile(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  const international =
    digits.length === 10 && digits.startsWith('0') ? `255${digits.slice(1)}` : digits;
  return /^255[67]\d{8}$/.test(international) ? international : null;
}

/** "255******678": enough to tell numbers apart in logs, never the whole number. */
export const maskNumber = (n: string): string => `${n.slice(0, 3)}******${n.slice(-3)}`;

export const codeMessage = (otp: string): string =>
  `PesaIQ: your code is ${otp}. Don't share it with anyone.`;

/** What Supabase Auth expects back from a hook that failed. */
export interface HookError {
  http_code: number;
  message: string;
}

// Shown to the person signing up, so they say what to do, never why the
// provider refused (credits, sender registration).
const TRY_LATER: HookError = {
  http_code: 503,
  message: "Codes can't be sent right now. Please try again later.",
};
const TOO_MANY: HookError = {
  http_code: 429,
  message: 'Too many codes were sent to this number. Please wait and try again.',
};
const BAD_NUMBER: HookError = {
  http_code: 400,
  message: "This number can't receive SMS codes. Check it and try again.",
};
const NOT_SENT: HookError = {
  http_code: 502,
  message: 'The code could not be sent. Please try again.',
};

interface ProviderStatus {
  groupId?: number;
  id?: number;
  name?: string;
}

/** Delivery-group statuses that mean the message did not arrive. */
const UNDELIVERED = new Set([74, 75, 76, 78, 79, 80]);

/** Why the provider refused a message, by its status id. */
function refusal(id: number | undefined): HookError {
  switch (id) {
    case 56: // sender ID not registered on the account
    case 57: // out of credits
    case 58: // sender not registered on the network
    case 60: // credits expired
    case 61: // test account limited to one number
    case 62: // no route set up
    case 111: // no active outlet
      return TRY_LATER;
    case 63: // flooding filter: 20 varied or 6 identical per number per hour
    case 110: // sending limit exceeded
      return TOO_MANY;
    case 54: // prefix or length not recognised
    case 55: // number on Do Not Disturb
    case 59: // number blacklisted
    case 69: // invalid destination
    case 76: // undeliverable
      return BAD_NUMBER;
    default:
      return NOT_SENT;
  }
}

export type Outcome =
  { ok: true; status: string } | { ok: false; status: string; error: HookError };

/**
 * The provider's answer for the first (only) message. Groups 18 (pending) and
 * 20 (delivery) mean it went out; 19 (rejected) and 22 (failed) mean it did not.
 */
export function outcomeOf(body: unknown): Outcome {
  const status = (body as { messages?: { status?: ProviderStatus }[] } | null)?.messages?.[0]
    ?.status;
  if (!status) return { ok: false, status: 'no status', error: NOT_SENT };

  const label = `${status.id ?? '?'} ${status.name ?? ''}`.trim();
  const refused =
    status.groupId === 19 ||
    status.groupId === 22 ||
    (status.groupId === 20 && UNDELIVERED.has(status.id ?? -1));
  if (refused) return { ok: false, status: label, error: refusal(status.id) };
  if (status.groupId === 18 || status.groupId === 20) return { ok: true, status: label };
  return { ok: false, status: label, error: NOT_SENT };
}

/** When the provider answers with an HTTP error instead of a status. */
export function providerHttpError(httpStatus: number): HookError {
  if (httpStatus === 429) return TOO_MANY;
  // A wrong or revoked token, or an account problem: nothing the user can fix.
  if (httpStatus === 401 || httpStatus === 403) return TRY_LATER;
  return NOT_SENT;
}
