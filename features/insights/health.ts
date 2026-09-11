/**
 * The financial health score.
 *
 * Ported from the design prototype and LOCKED as the shipped formula (decided
 * 2026-09-11). The weights and bands below are exactly the prototype's. They
 * live here and nowhere else, so retuning is a one-line change, and the tests
 * pin them, so any change is deliberate.
 */
import type { Transaction } from '../transactions/model';
import { isCounted } from '../transactions/selectors';
import { isIncoming, isOutgoing } from '../../types/domain';

export const HEALTH_WEIGHTS = {
  /** Share of income not spent. */
  keptFromIncome: 0.4,
  /** Share of records the user has confirmed. */
  verifiedRecords: 0.25,
  /** How little of the spending left as cash withdrawals. */
  lowCashOut: 0.2,
  /** Share of records carrying a transaction reference. */
  traceableRecords: 0.15,
} as const;

/** Lower bounds, highest first. */
export const HEALTH_BANDS = [
  { min: 80, label: 'Strong' },
  { min: 60, label: 'Steady' },
  { min: 40, label: 'Mixed' },
  { min: 0, label: 'Strained' },
] as const;

export type HealthBand = (typeof HEALTH_BANDS)[number]['label'];
export type HealthPartKey = keyof typeof HEALTH_WEIGHTS;

export interface HealthPart {
  key: HealthPartKey;
  label: string;
  /** 0-1. */
  value: number;
  weight: number;
}

export interface Health {
  /** 0-100. */
  score: number;
  band: HealthBand;
  parts: HealthPart[];
  received: number;
  sent: number;
  /** Of `sent`, the part withdrawn as cash. */
  cash: number;
  net: number;
  /** Share of income kept, 0-1. */
  savings: number;
  recordCount: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function bandForScore(score: number): HealthBand {
  return (HEALTH_BANDS.find((b) => score >= b.min) ?? HEALTH_BANDS[HEALTH_BANDS.length - 1]).label;
}

/**
 * Score the ledger, or null when there is nothing to score.
 *
 * The prototype reports 20 ("Strained") for an empty ledger, because low
 * cash-out is vacuously perfect when nothing was spent. A number built from no
 * data would mislead, so there is none.
 *
 * Ignored and failed records are left out, as they are from every total.
 */
export function computeHealth(transactions: readonly Transaction[]): Health | null {
  const records = transactions.filter(isCounted);
  if (records.length === 0) return null;

  let received = 0;
  let sent = 0;
  let cash = 0;
  let confirmed = 0;
  let withReference = 0;

  for (const t of records) {
    const amount = t.amount ?? 0;
    if (isIncoming(t.type)) received += amount;
    else if (isOutgoing(t.type)) sent += amount;
    if (t.type === 'WITHDRAWAL') cash += amount;
    if (t.status === 'CONFIRMED') confirmed += 1;
    if (t.transactionReference) withReference += 1;
  }

  const n = records.length;
  const savings = received > 0 ? clamp01((received - sent) / received) : 0;

  const parts: HealthPart[] = [
    {
      key: 'keptFromIncome',
      label: 'Kept from income',
      value: savings,
      weight: HEALTH_WEIGHTS.keptFromIncome,
    },
    {
      key: 'verifiedRecords',
      label: 'Verified records',
      value: confirmed / n,
      weight: HEALTH_WEIGHTS.verifiedRecords,
    },
    {
      key: 'lowCashOut',
      label: 'Low cash-out',
      value: sent > 0 ? 1 - Math.min(1, cash / sent) : 1,
      weight: HEALTH_WEIGHTS.lowCashOut,
    },
    {
      key: 'traceableRecords',
      label: 'Traceable records',
      value: withReference / n,
      weight: HEALTH_WEIGHTS.traceableRecords,
    },
  ];

  const score = Math.round(100 * parts.reduce((sum, p) => sum + p.value * p.weight, 0));

  return {
    score,
    band: bandForScore(score),
    parts,
    received,
    sent,
    cash,
    net: received - sent,
    savings,
    recordCount: n,
  };
}
