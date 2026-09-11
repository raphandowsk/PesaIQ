/**
 * Stage 4: how much should this parse be trusted?
 *
 * Ported from the factor block in the design canvas. The weights are the
 * shipped formula, not placeholders — changing a number here changes what the
 * app tells users is verified, so tests assert every one of them.
 */
import type { MessageCategory } from '../../types/domain';

export type ConfidenceBand = 'Very high' | 'High' | 'Medium' | 'Needs review';

export interface ConfidenceFactor {
  label: string;
  hit: boolean;
  weight: number;
}

/** Baseline before any factor lands, so a bare parse is not scored at zero. */
export const CONFIDENCE_BASE = 0.24;
export const CONFIDENCE_MIN = 0.18;
export const CONFIDENCE_MAX = 0.98;

/**
 * Promotional and OTP messages are capped: neither should ever look like a
 * confident transaction, however many incidental fields they happen to carry.
 */
export const NON_TRANSACTIONAL_CAP = 0.52;

/** Band thresholds. Below MEDIUM a record goes to the review queue. */
export const BAND_THRESHOLDS = {
  veryHigh: 0.95,
  high: 0.8,
  medium: 0.6,
} as const;

/** A field below this is flagged `low` and never treated as verified. */
export const LOW_FIELD_THRESHOLD = 0.75;

export const FACTOR_WEIGHTS = {
  provider: 0.16,
  type: 0.16,
  amount: 0.2,
  reference: 0.14,
  counterparty: 0.12,
  date: 0.1,
  balance: 0.08,
} as const;

export interface ConfidenceInput {
  hasProvider: boolean;
  /** The classifier landed on something other than OTHER. */
  hasKnownType: boolean;
  /** Amount AND currency were stated - a bare number does not count. */
  hasAmountWithCurrency: boolean;
  hasReference: boolean;
  hasCounterparty: boolean;
  hasDate: boolean;
  hasBalance: boolean;
  category: MessageCategory;
  classifierConfidence: number;
}

export interface ConfidenceResult {
  confidence: number;
  band: ConfidenceBand;
  factors: ConfidenceFactor[];
}

export function buildFactors(input: ConfidenceInput): ConfidenceFactor[] {
  return [
    { label: 'Provider recognized', hit: input.hasProvider, weight: FACTOR_WEIGHTS.provider },
    { label: 'Message type recognized', hit: input.hasKnownType, weight: FACTOR_WEIGHTS.type },
    {
      label: 'Amount + currency',
      hit: input.hasAmountWithCurrency,
      weight: FACTOR_WEIGHTS.amount,
    },
    { label: 'Reference extracted', hit: input.hasReference, weight: FACTOR_WEIGHTS.reference },
    {
      label: 'Counterparty extracted',
      hit: input.hasCounterparty,
      weight: FACTOR_WEIGHTS.counterparty,
    },
    { label: 'Date extracted', hit: input.hasDate, weight: FACTOR_WEIGHTS.date },
    { label: 'Balance extracted', hit: input.hasBalance, weight: FACTOR_WEIGHTS.balance },
  ];
}

/**
 * Score a parse.
 *
 * The classifier multiplier means a confidently-typed message keeps most of its
 * factor score, while an uncertain one is damped even with every field present.
 */
export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  const factors = buildFactors(input);

  const raw = factors.reduce((sum, f) => sum + (f.hit ? f.weight : 0), CONFIDENCE_BASE);

  const damped = raw * (0.72 + input.classifierConfidence * 0.3);

  // The cap is applied AFTER damping so it is a real ceiling. The canvas caps
  // first, which lets the multiplier (up to 1.02) lift the value back over the
  // line; that holds today only because promotional and OTP confidences happen
  // to stay below ~0.933. Enforcing it here costs at most 0.003 on real input
  // and never changes a band, but makes the guarantee hold by construction.
  const capped =
    input.category === 'PROMOTIONAL' || input.category === 'OTP'
      ? Math.min(damped, NON_TRANSACTIONAL_CAP)
      : damped;

  const confidence = Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, capped));

  return { confidence, band: bandFor(confidence), factors };
}

export function bandFor(confidence: number): ConfidenceBand {
  if (confidence >= BAND_THRESHOLDS.veryHigh) return 'Very high';
  if (confidence >= BAND_THRESHOLDS.high) return 'High';
  if (confidence >= BAND_THRESHOLDS.medium) return 'Medium';
  return 'Needs review';
}

/** A field is doubtful when it was found but weakly. Missing is not low. */
export function isLowConfidenceField(confidence: number): boolean {
  return confidence > 0 && confidence < LOW_FIELD_THRESHOLD;
}
