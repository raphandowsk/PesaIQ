import { computeHealth, type Health } from '../features/insights/health';
import {
  BAND_MEANINGS,
  explainHealth,
  HEALTH_SCALE,
  partPoints,
} from '../features/insights/healthExplain';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';

const demo = (): Transaction[] => DEMO_RECORDS.map((r) => r.transaction);
const t = (over: Partial<Transaction>): Transaction => ({
  ...DEMO_RECORDS[0].transaction,
  id: `t-${Math.random()}`,
  status: 'CONFIRMED',
  isDemo: false,
  ...over,
});

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

describe('partPoints', () => {
  it('splits the demo score into whole points that add up to it exactly', () => {
    const h = computeHealth(demo())!;
    // Exact: 34.22, 12.5, 8.54, 12.5 = 67.77, shown as 68.
    expect(partPoints(h)).toEqual([34, 13, 9, 12]);
    expect(sum(partPoints(h))).toBe(h.score);
  });

  it('always adds up to the score, and never beyond a part’s maximum', () => {
    // A fixed-seed generator, so a failure always reproduces.
    let seed = 7;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const types = ['RECEIVED', 'SENT', 'WITHDRAWAL', 'BILL_PAYMENT', 'AIRTIME'] as const;

    for (let run = 0; run < 200; run++) {
      const records = Array.from({ length: 1 + Math.floor(next() * 12) }, () =>
        t({
          type: types[Math.floor(next() * types.length)],
          amount: Math.round(next() * 500000),
          fee: next() < 0.5 ? Math.round(next() * 2000) : null,
          status: next() < 0.5 ? 'CONFIRMED' : 'PARSED',
          transactionReference: next() < 0.7 ? 'REF123456' : null,
        }),
      );
      const h = computeHealth(records)!;
      const points = partPoints(h);
      expect(sum(points)).toBe(h.score);
      h.parts.forEach((p, i) => {
        expect(points[i]).toBeGreaterThanOrEqual(0);
        expect(points[i]).toBeLessThanOrEqual(Math.round(p.weight * 100));
      });
    }
  });
});

describe('explainHealth', () => {
  const h = computeHealth(demo())!;
  const e = explainHealth(h);

  it('says what the score means, with its place on the scale', () => {
    expect(e.meaning).toBe(`68 out of 100 is Steady (60–79). ${BAND_MEANINGS.Steady}`);
  });

  it('lays the scale out as four ranges from 0 to 100', () => {
    expect(HEALTH_SCALE.map((s) => [s.band, s.min, s.max])).toEqual([
      ['Strained', 0, 39],
      ['Mixed', 40, 59],
      ['Steady', 60, 79],
      ['Strong', 80, 100],
    ]);
  });

  it('explains each part in the user’s own figures', () => {
    expect(e.parts.map((p) => [p.label, p.points, p.maxPoints])).toEqual([
      ['Kept from income', 34, 40],
      ['Verified records', 13, 25],
      ['Low cash-out', 9, 20],
      ['Traceable records', 12, 15],
    ]);
    expect(e.parts[0].detail).toBe(
      'You kept 86% of the TZS 1,450,000 that came in. TZS 209,500 went out, including TZS 1,000 in fees and taxes.',
    );
    expect(e.parts[1].detail).toBe('3 of 6 records confirmed by you.');
    expect(e.parts[2].detail).toBe(
      'Cash withdrawals were 57% of the TZS 209,500 that went out. Less cash scores higher.',
    );
    expect(e.parts[3].detail).toBe('5 of 6 records carry a transaction reference.');
  });

  it('points to where the most points are still to be won', () => {
    expect(e.biggestGain).toEqual({
      label: 'Verified records',
      points: 12,
      raise: 'Confirm your records in Review.',
    });
  });

  it('says so plainly when more went out than came in', () => {
    const tight = computeHealth([
      t({ type: 'RECEIVED', amount: 1000 }),
      t({ type: 'SENT', amount: 5000, fee: null }),
    ])!;
    expect(explainHealth(tight).parts[0].detail).toBe(
      'More went out (TZS 5,000) than came in (TZS 1,000), so nothing counts as kept.',
    );
  });

  it('handles a ledger with no income and nothing out', () => {
    const empty: Health = { ...h, received: 0, sent: 0, cash: 0, savings: 0 };
    const parts = explainHealth(empty).parts;
    expect(parts[0].detail).toBe('No money has come in yet, so nothing counts as kept.');
    expect(parts[2].detail).toBe('Nothing has gone out yet, so this part is full.');
  });

  it('has no "room to grow" when every part is full', () => {
    const full = computeHealth([
      t({ type: 'RECEIVED', amount: 1000, transactionReference: 'R1' }),
    ])!;
    expect(full.score).toBe(100);
    expect(explainHealth(full).biggestGain).toBeNull();
  });
});
