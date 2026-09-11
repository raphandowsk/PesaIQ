/**
 * The parser engine: normalize, classify, extract, score.
 *
 * Ported from `runParse()` in the design canvas. Pure and synchronous — no I/O,
 * no dates read from the clock, no randomness — so a given message always
 * produces the same result and the tests can pin exact numbers.
 */
import { CATEGORY_TO_TYPE, DEFAULT_CURRENCY, TYPE_LABELS } from '../../types/domain';
import { classify } from './classifier';
import { isLowConfidenceField, scoreConfidence } from './confidence';
import {
  extractAmount,
  extractBalance,
  extractCounterparty,
  extractDate,
  extractMaskedIdentifier,
  extractReference,
} from './extractors';
import { normalizationNote, normalize, type NormalizedSms } from './normalizer';
import { detectProvider } from './providers';
import type { ParseResult, ParsedField } from './schema';

/** Longest message we will attempt. Beyond this the input is likely not an SMS. */
export const MAX_MESSAGE_LENGTH = 1600;

export class EmptyMessageError extends Error {
  constructor() {
    super('Paste a message before analyzing.');
    this.name = 'EmptyMessageError';
  }
}

export class MessageTooLongError extends Error {
  constructor() {
    super('Message is unusually long (over 1,600 characters). Trim it and try again.');
    this.name = 'MessageTooLongError';
  }
}

function buildField(
  key: string,
  label: string,
  value: string | number | null,
  display: string,
  confidence: number,
): ParsedField {
  const asText = value == null ? '' : String(value);
  return {
    key,
    label,
    value: asText,
    display,
    confidence,
    low: isLowConfidenceField(confidence),
    missing: asText === '',
  };
}

/** Format a number the way the UI shows money. */
export function formatAmount(n: number | null | undefined): string {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Parse an already-normalized message.
 *
 * Prefer `parseMessage`, which normalizes first. This overload exists for
 * Stage 2, where the native source normalizes before handing work over.
 */
export function parseNormalized(sms: NormalizedSms): ParseResult {
  const text = sms.normalizedText;

  // The demo samples carry their sender inline; a real source passes it in.
  const sender = sms.sender || /DEMO-[A-Z-]+/.exec(text)?.[0] || undefined;

  const classification = classify(text);
  const provider = detectProvider(text, sender);

  const amount = extractAmount(text);
  const balance = extractBalance(text);
  const reference = extractReference(text);
  const counterparty = extractCounterparty(text);
  const identifier = extractMaskedIdentifier(text);
  const when = extractDate(text);

  const warnings = [amount.warning, reference.warning, when.warning].filter(
    (w): w is string => !!w,
  );

  const type = CATEGORY_TO_TYPE[classification.category];
  const hasAmountWithCurrency = amount.value != null && amount.confidence >= 0.9;

  const { confidence, band, factors } = scoreConfidence({
    hasProvider: provider.name != null,
    hasKnownType: classification.category !== 'OTHER',
    hasAmountWithCurrency,
    hasReference: reference.value != null,
    hasCounterparty: counterparty.value != null,
    hasDate: when.date != null,
    hasBalance: balance.value != null,
    category: classification.category,
    classifierConfidence: classification.confidence,
  });

  const fields: ParsedField[] = [
    buildField(
      'category',
      'Type',
      classification.category,
      `${classification.category.replace(/_/g, ' ')} - ${TYPE_LABELS[type]}`,
      classification.confidence,
    ),
    buildField(
      'provider',
      'Provider',
      provider.name,
      provider.name ?? 'Not recognized',
      provider.confidence,
    ),
    buildField(
      'amount',
      'Amount',
      amount.value,
      amount.value == null ? 'Missing' : `${DEFAULT_CURRENCY} ${formatAmount(amount.value)}`,
      amount.confidence,
    ),
    buildField(
      'counterparty',
      'Counterparty',
      counterparty.value,
      counterparty.value ?? 'Not found',
      counterparty.confidence,
    ),
    buildField(
      'masked',
      'Account / phone',
      identifier.value,
      identifier.value ?? 'Not found',
      identifier.confidence,
    ),
    buildField(
      'reference',
      'Reference',
      reference.value,
      reference.value ?? 'Not found',
      reference.confidence,
    ),
    buildField(
      'balance',
      'Balance after',
      balance.value,
      balance.value == null ? 'Not found' : `${DEFAULT_CURRENCY} ${formatAmount(balance.value)}`,
      balance.confidence,
    ),
    buildField(
      'date',
      'Date',
      when.date,
      when.date ? `${when.date}${when.time ? ` - ${when.time}` : ''}` : 'Not found',
      when.confidence,
    ),
  ];

  return {
    originalText: sms.originalText,
    normalizedText: text,
    normalizationNote: normalizationNote(sms),
    sender,

    category: classification.category,
    type,

    provider: provider.name,
    providerId: provider.id,

    amount: amount.value,
    currency: amount.value == null ? null : DEFAULT_CURRENCY,
    counterparty: counterparty.value,
    maskedAccountOrPhone: identifier.value,
    transactionReference: reference.value,
    balanceAfter: balance.value,
    transactionDate: when.date,
    transactionTime: when.time,

    confidence,
    band,
    parserId: provider.name ? 'GenericParser + provider hints (DEMO)' : 'GenericParser (DEMO)',

    warnings,
    reasons: classification.reasons,
    factors,
    fields,
  };
}

/**
 * Parse a raw pasted message.
 *
 * @throws EmptyMessageError when there is nothing to parse.
 * @throws MessageTooLongError when the input exceeds MAX_MESSAGE_LENGTH.
 */
export function parseMessage(
  raw: string,
  options: { sender?: string; receivedAt?: string } = {},
): ParseResult {
  if (!raw.trim()) throw new EmptyMessageError();
  if (raw.trim().length > MAX_MESSAGE_LENGTH) throw new MessageTooLongError();

  return parseNormalized(normalize(raw, options));
}
