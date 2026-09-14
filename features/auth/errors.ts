/**
 * What to tell someone when signing in fails.
 *
 * Supabase reports failures as an error code, an HTTP status and English text.
 * These become a sentence saying what to do next. The service's own wording is
 * never shown: it can mention hooks, tokens or rate limits.
 */

/** The parts of a Supabase AuthError that matter here. */
export interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

export type AuthStep = 'send' | 'verify' | 'signOut';

export const AUTH_MESSAGES = {
  noConnection: 'No internet connection. Check it and try again.',
  waitToResend: 'Please wait a minute before asking for another code.',
  tooManyTries: 'Too many tries. Please wait a minute, then try again.',
  badCode: 'That code is wrong or has expired. Check it, or ask for a new one.',
  switchedOff: 'Sign-in is switched off right now. Please try again later.',
  badNumber: 'Enter a Tanzanian mobile number: 9 digits after +255.',
  cantSend: "Codes can't be sent right now. Please try again later.",
  tryAgain: 'Something went wrong. Please try again.',
} as const;

export function authErrorMessage(error: AuthErrorLike, step: AuthStep): string {
  const code = error.code ?? '';
  const text = (error.message ?? '').toLowerCase();
  const status = error.status ?? 0;

  // Supabase's client calls both a lost connection (status 0) and any server
  // error (status 5xx) "retryable". Only the first is a connection problem.
  if (
    (error.name === 'AuthRetryableFetchError' && status === 0) ||
    /network request failed|failed to fetch|fetch failed|network error/.test(text)
  ) {
    return AUTH_MESSAGES.noConnection;
  }
  if (
    code === 'over_sms_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    status === 429 ||
    text.includes('for security purposes')
  ) {
    return step === 'send' ? AUTH_MESSAGES.waitToResend : AUTH_MESSAGES.tooManyTries;
  }
  if (step === 'verify' && (code === 'otp_expired' || /expired|invalid/.test(text))) {
    return AUTH_MESSAGES.badCode;
  }
  if (code === 'phone_provider_disabled' || code === 'signup_disabled' || code === 'otp_disabled') {
    return AUTH_MESSAGES.switchedOff;
  }
  if (step === 'send' && code === 'validation_failed') return AUTH_MESSAGES.badNumber;
  if (
    step === 'send' &&
    (code === 'sms_send_failed' ||
      code.startsWith('hook_') ||
      text.includes('hook') ||
      status >= 500)
  ) {
    return AUTH_MESSAGES.cantSend;
  }
  return AUTH_MESSAGES.tryAgain;
}

/** Anything thrown or returned as an error, read as an AuthErrorLike. */
export const asAuthError = (error: unknown): AuthErrorLike =>
  typeof error === 'object' && error !== null
    ? (error as AuthErrorLike)
    : { message: String(error) };
