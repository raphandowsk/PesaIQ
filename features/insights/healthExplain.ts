/**
 * The health score in words: what the number means, and what each part earned,
 * in the user's own figures.
 *
 * The points split the score across its four parts. They are whole numbers
 * that add up exactly to the score on the ring (largest remainder), so the
 * explanation can never disagree with it.
 */
import { formatAmount } from '../../utils/format';
import { HEALTH_BANDS, type Health, type HealthBand, type HealthPartKey } from './health';

const tzs = (n: number) => `TZS ${formatAmount(n)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** One sentence per band. A guide, not a judgement, and never a credit score. */
export const BAND_MEANINGS: Record<HealthBand, string> = {
  Strong: 'You keep a large share of what comes in, and your records are verified and traceable.',
  Steady: 'Mostly on track, with clear room to improve.',
  Mixed: 'Some habits help and others pull the score down.',
  Strained:
    'Money going out is close to, or more than, money coming in, or the records are hard to rely on.',
};

export interface ScaleStep {
  band: HealthBand;
  min: number;
  max: number;
}

/** The bands as ranges, lowest first: 0–39, 40–59, 60–79, 80–100. */
export const HEALTH_SCALE: ScaleStep[] = [...HEALTH_BANDS].reverse().map((b, i, all) => ({
  band: b.label,
  min: b.min,
  max: i < all.length - 1 ? all[i + 1].min - 1 : 100,
}));

/** What raises each part. */
const RAISE: Record<HealthPartKey, string> = {
  keptFromIncome: 'Spend less than comes in, and keep an eye on fees.',
  verifiedRecords: 'Confirm your records in Review.',
  lowCashOut: 'Pay by wallet or Lipa number instead of withdrawing cash.',
  traceableRecords: 'Save messages that carry a transaction reference.',
};

export interface PartExplanation {
  key: HealthPartKey;
  label: string;
  /** Whole points earned; the parts add up to the score. */
  points: number;
  /** The most this part can earn: its weight, out of 100. */
  maxPoints: number;
  /** 0–1: how well this part scored before weighting. */
  value: number;
  /** What the part measured, in the user's figures. */
  detail: string;
  raise: string;
}

export interface HealthExplanation {
  /** "68 out of 100 is Steady (60–79). Mostly on track, ..." */
  meaning: string;
  scale: ScaleStep[];
  parts: PartExplanation[];
  /** The part with the most points still to win, or null when every part is full. */
  biggestGain: { label: string; points: number; raise: string } | null;
}

/** Whole points per part that add up exactly to `health.score`. */
export function partPoints(health: Health): number[] {
  const exact = health.parts.map((p) => p.value * p.weight * 100);
  const points = exact.map((x) => Math.floor(x));
  let left = health.score - points.reduce((sum, p) => sum + p, 0);

  const byRemainder = exact
    .map((x, i) => ({ i, remainder: x - Math.floor(x) }))
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  for (const { i } of byRemainder) {
    if (left <= 0) break;
    points[i] += 1;
    left -= 1;
  }
  return points;
}

function detailFor(key: HealthPartKey, h: Health): string {
  switch (key) {
    case 'keptFromIncome': {
      if (h.received <= 0) return 'No money has come in yet, so nothing counts as kept.';
      if (h.sent >= h.received) {
        return `More went out (${tzs(h.sent)}) than came in (${tzs(h.received)}), so nothing counts as kept.`;
      }
      const fees = h.charges > 0 ? `, including ${tzs(h.charges)} in fees and taxes` : '';
      return `You kept ${pct(h.savings)} of the ${tzs(h.received)} that came in. ${tzs(h.sent)} went out${fees}.`;
    }
    case 'verifiedRecords':
      return `${h.confirmed} of ${h.recordCount} ${h.recordCount === 1 ? 'record' : 'records'} confirmed by you.`;
    case 'lowCashOut':
      if (h.sent <= 0) return 'Nothing has gone out yet, so this part is full.';
      return `Cash withdrawals were ${pct(Math.min(1, h.cash / h.sent))} of the ${tzs(h.sent)} that went out. Less cash scores higher.`;
    case 'traceableRecords':
      return `${h.withReference} of ${h.recordCount} ${h.recordCount === 1 ? 'record carries' : 'records carry'} a transaction reference.`;
  }
}

export function explainHealth(health: Health): HealthExplanation {
  const points = partPoints(health);
  const step = HEALTH_SCALE.find((s) => s.band === health.band);
  const range = step ? ` (${step.min}–${step.max})` : '';

  const parts: PartExplanation[] = health.parts.map((p, i) => ({
    key: p.key,
    label: p.label,
    points: points[i],
    maxPoints: Math.round(p.weight * 100),
    value: p.value,
    detail: detailFor(p.key, health),
    raise: RAISE[p.key],
  }));

  const room = parts
    .map((p) => ({ part: p, gap: p.maxPoints - p.points }))
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.gap - a.gap);

  return {
    meaning: `${health.score} out of 100 is ${health.band}${range}. ${BAND_MEANINGS[health.band]}`,
    scale: HEALTH_SCALE,
    parts,
    biggestGain: room[0]
      ? { label: room[0].part.label, points: room[0].gap, raise: room[0].part.raise }
      : null,
  };
}
