/** Supabase lets a number ask for one code a minute. */
export const RESEND_AFTER_S = 60;

/** Whole seconds until another code may be asked for; 0 when it may. */
export function resendWait(sentAt: number, now: number, after = RESEND_AFTER_S): number {
  return Math.max(0, Math.ceil(after - (now - sentAt) / 1000));
}

/** 42 -> "0:42". */
export const formatWait = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
