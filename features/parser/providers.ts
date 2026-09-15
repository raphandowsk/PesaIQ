/**
 * Provider recognition.
 *
 * The five mobile-money operators are EXPERIMENTAL: the Tanzania parser
 * (features/parser/tz) reads them from layouts documented in the Tanzania
 * Mobile Money SMS Specification and, for Mixx, from the owner's own
 * messages (anonymized in tests/fixtures). None is SUPPORTED: the layouts
 * still have to be checked against messages from real phones. T-PESA rests on
 * a single public example. The banks stay DEMO: their live formats are not
 * known, and nothing in this file claims otherwise.
 *
 * The hints below are the fallback for messages the Tanzania parser does not
 * recognize: invented demo senders plus a few generic tokens ("acct", bank
 * names) that are safe to look for.
 */
import type { ProviderMaturity } from '../../types/domain';
import { OPERATOR_INFO } from './tz/types/operator';

export interface SmsProvider {
  id: string;
  name: string;
  country: string;
  enabled: boolean;
  maturity: ProviderMaturity;
}

/** The provider registry seeded into the database. */
export const PROVIDERS: SmsProvider[] = [
  { id: 'mpesa', name: 'M-Pesa', country: 'TZ', enabled: true, maturity: 'EXPERIMENTAL' },
  { id: 'airtel', name: 'Airtel Money', country: 'TZ', enabled: true, maturity: 'EXPERIMENTAL' },
  { id: 'mixx', name: 'Mixx by Yas', country: 'TZ', enabled: true, maturity: 'EXPERIMENTAL' },
  { id: 'halopesa', name: 'HaloPesa', country: 'TZ', enabled: true, maturity: 'EXPERIMENTAL' },
  { id: 'tpesa', name: 'T-PESA', country: 'TZ', enabled: true, maturity: 'EXPERIMENTAL' },
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

/**
 * The mobile-money operators: the providers onboarding and Settings offer.
 * The banks and generic providers stay in the registry, for the general rules.
 */
export const MOBILE_MONEY_PROVIDER_IDS: readonly string[] = Object.values(OPERATOR_INFO).map(
  (o) => o.providerId,
);

export const isMobileMoneyProvider = (p: { id: string }): boolean =>
  MOBILE_MONEY_PROVIDER_IDS.includes(p.id);

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
  // The demo senders only. A real M-Pesa or Airtel message is the Tanzania
  // parser's to recognize, from several signals, never from one word here.
  { id: 'mpesa', match: /wallet-a/i, name: 'Wallet A (M-Pesa-like demo)' },
  { id: 'airtel', match: /wallet-b/i, name: 'Wallet B (Airtel-like demo)' },
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
