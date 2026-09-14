/**
 * §45's confidence rules, with §53's consistency check: a reading is trusted
 * when several fields agree, never on one field alone. Each problem found in
 * the fields costs 0.1. The ceiling is §40's 0.98: even a perfect reading of
 * an SMS is not a verified payment (§31).
 */
import type { TzConfidenceFactor } from './types/transaction';

export const TZ_CONFIDENCE_WEIGHTS = {
  operator: 0.25,
  type: 0.2,
  amount: 0.2,
  transactionId: 0.15,
  party: 0.1,
  balance: 0.05,
  date: 0.025,
  time: 0.025,
} as const;

export const TZ_CONFIDENCE_MAX = 0.98;
/** Below this a message is not classified as a transaction (§30). */
export const TZ_UNKNOWN_BELOW = 0.5;
/** An operator counts as "detected" from here (§28's weights: two signals). */
export const OPERATOR_DETECTED = 0.5;
/** What each consistency problem costs. */
export const PROBLEM_PENALTY = 0.1;

export interface TzConfidenceInput {
  operatorScore: number;
  typeKnown: boolean;
  amount: boolean;
  transactionId: boolean;
  party: boolean;
  balance: boolean;
  date: boolean;
  time: boolean;
  /** Fields that do not add up. */
  problems: number;
}

export function scoreTzConfidence(input: TzConfidenceInput): {
  confidence: number;
  factors: TzConfidenceFactor[];
} {
  const w = TZ_CONFIDENCE_WEIGHTS;
  const factors: TzConfidenceFactor[] = [
    {
      label: 'Operator recognized',
      hit: input.operatorScore >= OPERATOR_DETECTED,
      weight: w.operator,
    },
    { label: 'Transaction type recognized', hit: input.typeKnown, weight: w.type },
    { label: 'Amount extracted', hit: input.amount, weight: w.amount },
    { label: 'Transaction ID extracted', hit: input.transactionId, weight: w.transactionId },
    { label: 'Sender or recipient extracted', hit: input.party, weight: w.party },
    { label: 'Balance extracted', hit: input.balance, weight: w.balance },
    { label: 'Date extracted', hit: input.date, weight: w.date },
    { label: 'Time extracted', hit: input.time, weight: w.time },
  ];
  const raw = factors.reduce((sum, f) => sum + (f.hit ? f.weight : 0), 0);
  const penalized = raw - input.problems * PROBLEM_PENALTY;
  const confidence = Math.round(Math.max(0, Math.min(TZ_CONFIDENCE_MAX, penalized)) * 1000) / 1000;
  return { confidence, factors };
}

/** §45's labels. */
export function tzConfidenceLevel(confidence: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (confidence >= 0.85) return 'HIGH';
  if (confidence >= 0.65) return 'MEDIUM';
  return 'LOW';
}
