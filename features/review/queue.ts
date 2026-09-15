/**
 * The review queue: which records need a person, what to ask about each, and
 * how much has been cleared this week.
 *
 * Pure, so the screen only renders it. The design hard-codes its counters
 * ("2/7 cleared", "6-day streak"); these are computed from what the user
 * actually did.
 */
import { startOfWeek } from '../insights/week';
import { bandFor } from '../parser';
import { isRecordEditable, type RecordEditableKey } from '../transactions/editRecord';
import type { Transaction } from '../transactions/model';
import { recordDate } from '../transactions/records';
import type { TransactionType } from '../../types/domain';

/** The design's weekly goal, as one constant so it can be retuned in one place. */
export const REVIEW_WEEKLY_TARGET = 7;

/** Records waiting for a person, newest transaction first. */
export function reviewQueue(transactions: readonly Transaction[]): Transaction[] {
  return transactions
    .filter((t) => t.status === 'NEEDS_REVIEW')
    .sort((a, b) => recordDate(b).getTime() - recordDate(a).getTime());
}

/** Monday 00:00, local time. Shared with Home's weekly chart, so both mean the same week. */
export { startOfWeek };

/** Review actions (confirm, correct, ignore) taken since Monday. */
export function clearedThisWeek(timestamps: readonly string[], now: Date): number {
  const from = startOfWeek(now).getTime();
  return timestamps.filter((ts) => {
    const t = new Date(ts).getTime();
    return !Number.isNaN(t) && t >= from;
  }).length;
}

/**
 * The fields a card asks about. The design always shows amount, counterparty
 * and reference; any other field the parser flagged joins them, so nothing it
 * was unsure about is left unasked. The masked number and the type never
 * appear as text: one is only ever held masked, the other has chips.
 */
const ALWAYS_ASKED: readonly RecordEditableKey[] = ['amount', 'counterparty', 'reference'];

export function reviewFields(t: Transaction): RecordEditableKey[] {
  const extra = t.lowFields.filter(
    (k): k is RecordEditableKey => isRecordEditable(k) && !ALWAYS_ASKED.includes(k),
  );
  return [...ALWAYS_ASKED, ...extra];
}

/** The design's five type chips. */
export const REVIEW_TYPE_OPTIONS: readonly TransactionType[] = [
  'RECEIVED',
  'SENT',
  'WITHDRAWAL',
  'AIRTIME',
  'BILL_PAYMENT',
];

/** The five, plus the record's own type if it is not one of them, so it can stay selected. */
export function reviewTypeOptions(current: TransactionType): TransactionType[] {
  return REVIEW_TYPE_OPTIONS.includes(current)
    ? [...REVIEW_TYPE_OPTIONS]
    : [...REVIEW_TYPE_OPTIONS, current];
}

export interface ConfidenceLabel {
  text: string;
  /** Show it in the "check" colour rather than the "good" one. */
  needsCheck: boolean;
}

/**
 * How to state a record's confidence.
 *
 * The overall score measures how much the parser found; a flag measures how
 * sure it is about one field. A record could read "Very high · 98%" and still
 * go to review, which looked like a contradiction. With fields flagged it now
 * says "98% overall · 1 to check". The score itself is unchanged, and with
 * nothing flagged it reads exactly as before.
 */
export function confidenceLabel(
  confidence: number,
  flagged: number,
  order: 'band-first' | 'pct-first',
): ConfidenceLabel {
  const pct = `${Math.round(confidence * 100)}%`;
  if (flagged > 0) return { text: `${pct} overall · ${flagged} to check`, needsCheck: true };

  const band = bandFor(confidence);
  return {
    text: order === 'band-first' ? `${band} · ${pct}` : `${pct} · ${band}`,
    needsCheck: confidence < 0.8,
  };
}
