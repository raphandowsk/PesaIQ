/**
 * Money moved per provider. The brief asks for a provider summary on the
 * dashboard; the design computes one but never places it, so PesaIQ shows it
 * as a compact card below the recent records.
 */
import type { Transaction } from '../transactions/model';
import { isCounted } from '../transactions/selectors';

export const UNRECOGNIZED_PROVIDER = 'Unrecognized sender';

export interface ProviderSummaryRow {
  name: string;
  count: number;
  /** Everything that moved through it, in and out. */
  amount: number;
}

/** Largest first. */
export function providerSummary(transactions: readonly Transaction[]): ProviderSummaryRow[] {
  const groups = new Map<string, ProviderSummaryRow>();

  for (const t of transactions) {
    if (!isCounted(t)) continue;
    const name = t.provider ?? UNRECOGNIZED_PROVIDER;
    const row = groups.get(name) ?? { name, count: 0, amount: 0 };
    row.count += 1;
    row.amount += t.amount ?? 0;
    groups.set(name, row);
  }

  return [...groups.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}
