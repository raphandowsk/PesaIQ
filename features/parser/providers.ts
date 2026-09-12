/**
 * Provider recognition.
 *
 * IMPORTANT: every parser here is DEMO maturity except Mixx by Yas, which is
 * EXPERIMENTAL: its rules come from three real Mixx layouts the user supplied
 * on 2026-09-12 (anonymized in tests/fixtures/tz-messages.ts). We do not know
 * the live SMS formats of M-Pesa, Airtel Money, CRDB, NMB, NBC, Absa or
 * Stanbic, and nothing in this file claims otherwise. The other hints match
 * invented demo senders plus a few generic tokens ("acct", bank names) that are
 * safe to look for.
 *
 * A provider is promoted past DEMO only when anonymized fixtures from real
 * messages prove its rules. Until then the UI shows the DEMO badge.
 */
import type { ProviderMaturity } from '../../types/domain';

export interface SmsProvider {
  id: string;
  name: string;
  country: string;
  enabled: boolean;
  maturity: ProviderMaturity;
}

/** The provider registry seeded into the database. */
export const PROVIDERS: SmsProvider[] = [
  { id: 'mpesa', name: 'M-Pesa', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'airtel', name: 'Airtel Money', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'mixx', name: 'Mixx by Yas', country: 'TZ', enabled: true, maturity: 'EXPERIMENTAL' },
  { id: 'crdb', name: 'CRDB', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'nmb', name: 'NMB', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'nbc', name: 'NBC', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'absa', name: 'Absa', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'stanbic', name: 'Stanbic', country: 'TZ', enabled: true, maturity: 'DEMO' },
  { id: 'generic-bank', name: 'Generic Bank', country: 'TZ', enabled: true, maturity: 'DEMO' },
  {
    id: 'generic-payment',
    name: 'Generic Payment',
    country: 'TZ',
    enabled: true,
    maturity: 'DEMO',
  },
];

interface ProviderHint {
  id: string;
  match: RegExp;
  /** Display name. Deliberately says "demo" so no live format is implied. */
  name: string;
  /** True when a match means "not a known provider" rather than a provider. */
  unrecognized?: boolean;
}

/** Checked against the sender first, then the message body. */
const PROVIDER_HINTS: ProviderHint[] = [
  // First: Mixx messages name other networks ("kwenda kwa Vodacom ...") as the
  // destination, which must not be read as the sender. Each phrase is a
  // signature of one of the three Mixx layouts seen so far.
  {
    id: 'mixx',
    match: /\bmixx\b|jumla ya makato|bao la ushindi|kumbukumbu no\b/i,
    name: 'Mixx by Yas',
  },
  { id: 'mpesa', match: /wallet-a|m-?pesa/i, name: 'Wallet A (M-Pesa-like demo)' },
  { id: 'airtel', match: /wallet-b|airtel/i, name: 'Wallet B (Airtel-like demo)' },
  {
    id: 'bank',
    match: /demo-bank|crdb|nmb|nbc|absa|stanbic|acct|account/i,
    name: 'Demo Bank',
  },
  { id: 'promo', match: /promo/i, name: 'Unrecognized sender', unrecognized: true },
];

export interface ProviderMatch {
  id: string | null;
  name: string | null;
  confidence: number;
}

/**
 * Identify the provider from the sender id and message text.
 * An "unrecognized" hint resolves to no provider, not to a named one.
 */
export function detectProvider(text: string, sender?: string): ProviderMatch {
  const haystackSender = sender ?? '';

  const hint = PROVIDER_HINTS.find((h) => h.match.test(haystackSender) || h.match.test(text));

  if (!hint || hint.unrecognized) {
    return { id: null, name: null, confidence: 0 };
  }

  return { id: hint.id, name: hint.name, confidence: 0.86 };
}
