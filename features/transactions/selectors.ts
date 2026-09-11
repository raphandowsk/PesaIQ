/**
 * Pure derivations over the transaction list.
 *
 * Phase 1F adds the health score, categories and tips alongside these. They
 * live apart from the store so they can be tested without a database and
 * recomputed cheaply on every render.
 */
import { isIncoming, isOutgoing } from '../../types/domain';
import type { Transaction } from './model';

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
  sent: number;
  /** received - sent */
  net: number;
  /** Counted records only. */
  count: number;
  needsReview: number;
}

export function summarize(transactions: readonly Transaction[]): Summary {
  let received = 0;
  let sent = 0;
  let count = 0;

  for (const t of transactions) {
    if (!isCounted(t)) continue;
    count += 1;
    if (t.amount == null) continue;
    if (isIncoming(t.type)) received += t.amount;
    else if (isOutgoing(t.type)) sent += t.amount;
  }

  return {
    received,
    sent,
    net: received - sent,
    count,
    needsReview: needsReview(transactions).length,
  };
}
