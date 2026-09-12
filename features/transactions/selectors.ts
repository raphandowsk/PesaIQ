/**
 * Pure derivations over the transaction list.
 *
 * Phase 1F adds the health score, categories and tips alongside these. They
 * live apart from the store so they can be tested without a database and
 * recomputed cheaply on every render.
 */
import { isIncoming, isOutgoing } from '../../types/domain';
import type { Transaction } from './model';
import { chargesOf, spentOf } from './money';

/**
 * Whether a record counts toward money totals.
 *
 * Ignored and failed records do not: the user has said the first is not a real
 * transaction, and the second never parsed. Records awaiting review still count
 * — they are probably real, and hiding them would understate the month.
 */
export const isCounted = (t: Transaction): boolean =>
  t.status !== 'IGNORED' && t.status !== 'FAILED';

export const needsReview = (transactions: readonly Transaction[]): Transaction[] =>
  transactions.filter((t) => t.status === 'NEEDS_REVIEW');

export interface Summary {
  received: number;
  /** What outgoing money paid for. Fees and taxes are counted apart. */
  sent: number;
  /** Fees and taxes on every counted record. */
  charges: number;
  /** Everything that left the balance: `sent` plus `charges`. */
  totalOut: number;
  /** received - totalOut */
  net: number;
  /** Counted records only. */
  count: number;
  needsReview: number;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function summarize(transactions: readonly Transaction[]): Summary {
  let received = 0;
  let sent = 0;
  let charges = 0;
  let count = 0;

  for (const t of transactions) {
    if (!isCounted(t)) continue;
    count += 1;
    charges += chargesOf(t);
    if (t.amount == null) continue;
    if (isIncoming(t.type)) received += t.amount;
    else if (isOutgoing(t.type)) sent += spentOf(t);
  }

  const totalOut = sent + charges;
  return {
    received: cents(received),
    sent: cents(sent),
    charges: cents(charges),
    totalOut: cents(totalOut),
    net: cents(received - totalOut),
    count,
    needsReview: needsReview(transactions).length,
  };
}
