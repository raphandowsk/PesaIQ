/**
 * How a parse result's fields and figures are written, shared by the general
 * rules (engine.ts) and the Tanzania mobile-money parser (tzResult.ts).
 */
import { formatAmount as formatMoney } from '../../utils/format';
import { DEFAULT_CURRENCY, TAX_LABELS } from '../../types/domain';
import { isLowConfidenceField } from './confidence';
import type { ParsedField, TaxLine } from './schema';

export function buildField(
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
  // Shared with the UI so a figure reads the same on every screen, and so the
  // parser does not depend on per-device Intl data.
  return formatMoney(n);
}

export const money = (n: number) => `${DEFAULT_CURRENCY} ${formatAmount(n)}`;
export const cents = (n: number) => Math.round(n * 100) / 100;

/** "VAT TZS 69 (in the fee)", or "VAT 18% TZS 2,729.50 · EWURA 1% TZS 151.64". */
export function describeTaxes(taxes: readonly TaxLine[]): string {
  return taxes
    .map((t) => {
      const rate = t.ratePct == null ? '' : ` ${t.ratePct}%`;
      const where = t.within === 'fee' ? ' (in the fee)' : t.within === 'extra' ? ' (on top)' : '';
      return `${TAX_LABELS[t.code]}${rate} ${money(t.amount)}${where}`;
    })
    .join(' · ');
}
