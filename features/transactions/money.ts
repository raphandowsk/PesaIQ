/**
 * What a record cost, however its message itemised it.
 *
 * Three figures, which always reconcile: `spentOf` (what the money bought) plus
 * `chargesOf` (fees and taxes) equals `totalOutOf` (what left the balance).
 *
 * - Mixx "TSh 5,000 ... Jumla ya makato TSh 450, VAT TSh 69": spent 5,000,
 *   charges 450 (the VAT is inside the fee), total out 5,450.
 * - LUKU "TOTAL 20,000 ... VAT 2,729.50, EWURA 151.64, REA 454.92": the taxes
 *   are inside the total, so spent 16,663.94, charges 3,336.06, total out 20,000.
 */
import type { Transaction } from './model';

const cents = (n: number) => Math.round(n * 100) / 100;

const taxesWithin = (t: Transaction, within: 'fee' | 'amount' | 'extra') =>
  t.taxes.filter((x) => x.within === within).reduce((sum, x) => sum + x.amount, 0);

/** Fees and taxes the record cost, counted once whichever way they were itemised. */
export const chargesOf = (t: Transaction): number =>
  cents((t.fee ?? 0) + taxesWithin(t, 'extra') + taxesWithin(t, 'amount'));

/** What the money bought: the amount, less any taxes inside it. */
export const spentOf = (t: Transaction): number =>
  cents((t.amount ?? 0) - taxesWithin(t, 'amount'));

/** Everything that left the balance. */
export const totalOutOf = (t: Transaction): number =>
  cents((t.amount ?? 0) + (t.fee ?? 0) + taxesWithin(t, 'extra'));

/** The fee without the taxes already inside it: what the provider itself charged. */
export const feeBeforeTaxOf = (t: Transaction): number =>
  cents(Math.max(0, (t.fee ?? 0) - taxesWithin(t, 'fee')));
