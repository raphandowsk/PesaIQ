/**
 * Telling people about duplicates, and the copies saved before duplicates
 * were skipped.
 */
import { formatShortDate } from '../../utils/format';
import type { Transaction } from './model';

/** "Already saved on 12 Sep 2026": when the earlier record was saved. */
export const savedOnText = (existing: Transaction): string =>
  `Already saved on ${formatShortDate(new Date(existing.createdAt))}`;

/** For an edit that would make a record repeat another. */
export const duplicateEditText = (existing: Transaction): string =>
  `Another record already has this reference, saved on ${formatShortDate(
    new Date(existing.createdAt),
  )}. Nothing was changed.`;

export interface DuplicatePair {
  original: Transaction;
  copy: Transaction;
}

/** Copies whose earlier record still exists, oldest original first, then oldest copy. */
export function duplicatePairs(transactions: readonly Transaction[]): DuplicatePair[] {
  const byId = new Map(transactions.map((t) => [t.id, t]));
  return transactions
    .filter((t) => t.duplicateOf)
    .flatMap((copy) => {
      const original = byId.get(copy.duplicateOf ?? '');
      return original ? [{ original, copy }] : [];
    })
    .sort(
      (a, b) =>
        a.original.createdAt.localeCompare(b.original.createdAt) ||
        a.copy.createdAt.localeCompare(b.copy.createdAt),
    );
}
