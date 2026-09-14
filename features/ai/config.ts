/**
 * AI reading is paused (decided 2026-09-14): messages are read on the phone,
 * by the Tanzania mobile-money parser and the general rules, and nothing is
 * sent to an AI. The parse-sms Edge Function stays deployed, unused.
 *
 * Turning this back on also needs its consent copy restored (onboarding
 * privacy screen, Settings, docs/PRIVACY.md): see commit ec9a8bb.
 */
export const AI_READING_ENABLED = false;
