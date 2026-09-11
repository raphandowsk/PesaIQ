import {
  activityStreak,
  bandForScore,
  categoryBreakdown,
  categoryOf,
  computeHealth,
  earnTips,
  HEALTH_BANDS,
  HEALTH_WEIGHTS,
  providerSummary,
  spendTips,
  UNRECOGNIZED_PROVIDER,
} from '../features/insights';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';
import { formatLongDate, greetingFor } from '../utils/format';

const demo = (): Transaction[] => DEMO_RECORDS.map((r) => r.transaction);

const t = (over: Partial<Transaction>): Transaction => ({
  ...DEMO_RECORDS[0].transaction,
  id: `t-${Math.random()}`,
  status: 'CONFIRMED',
  isDemo: false,
  ...over,
});

describe('the locked health formula', () => {
  it('uses exactly the prototype weights, which sum to one', () => {
    expect(HEALTH_WEIGHTS).toEqual({
      keptFromIncome: 0.4,
      verifiedRecords: 0.25,
      lowCashOut: 0.2,
      traceableRecords: 0.15,
    });
    const sum = Object.values(HEALTH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('uses exactly the prototype bands', () => {
    expect(HEALTH_BANDS.map((b) => [b.min, b.label])).toEqual([
      [80, 'Strong'],
      [60, 'Steady'],
      [40, 'Mixed'],
      [0, 'Strained'],
    ]);
  });

  it.each([
    [100, 'Strong'],
    [80, 'Strong'],
    [79, 'Steady'],
    [60, 'Steady'],
    [59, 'Mixed'],
    [40, 'Mixed'],
    [39, 'Strained'],
    [0, 'Strained'],
  ])('puts a score of %p in %p', (score, band) => {
    expect(bandForScore(score)).toBe(band);
  });
});

describe('computeHealth', () => {
  it('reproduces the design mockup exactly on the demo records', () => {
    const h = computeHealth(demo())!;

    // The canvas thumbnail shows: received 1,450,000 · sent 208,500 ·
    // net +1,241,500 · parts 86% / 50% / 42% / 83% · "Steady".
    expect(h.received).toBe(1450000);
    expect(h.sent).toBe(208500);
    expect(h.net).toBe(1241500);
    expect(h.parts.map((p) => Math.round(p.value * 100))).toEqual([86, 50, 42, 83]);
    expect(h.score).toBe(68);
    expect(h.band).toBe('Steady');
  });

  it('has no score for an empty ledger, rather than a misleading 20', () => {
    expect(computeHealth([])).toBeNull();
  });

  it('leaves out ignored and failed records', () => {
    const base = demo();
    const withNoise = [
      ...base,
      t({ type: 'WITHDRAWAL', amount: 5_000_000, status: 'IGNORED' }),
      t({ type: 'SENT', amount: 9_000_000, status: 'FAILED' }),
    ];
    expect(computeHealth(withNoise)).toEqual(computeHealth(base));
  });

  it('counts a ledger with nothing but ignored records as empty', () => {
    expect(computeHealth([t({ status: 'IGNORED' })])).toBeNull();
  });

  it('treats no spending as perfectly low cash-out', () => {
    const h = computeHealth([t({ type: 'RECEIVED', amount: 1000 })])!;
    expect(h.parts.find((p) => p.key === 'lowCashOut')!.value).toBe(1);
  });

  it('keeps nothing from income when there is no income', () => {
    const h = computeHealth([t({ type: 'SENT', amount: 1000 })])!;
    expect(h.savings).toBe(0);
  });

  it('never lets spending push "kept from income" below zero', () => {
    const h = computeHealth([
      t({ type: 'RECEIVED', amount: 1000 }),
      t({ type: 'SENT', amount: 5000 }),
    ])!;
    expect(h.savings).toBe(0);
  });
});

describe('categories', () => {
  it.each<[Partial<Transaction>, string]>([
    [{ type: 'AIRTIME' }, 'Airtime & data'],
    [{ type: 'WITHDRAWAL' }, 'Cash withdrawals'],
    [{ type: 'BILL_PAYMENT', counterparty: 'LUKU TOKEN' }, 'Electricity & LUKU'],
    [{ type: 'BILL_PAYMENT', counterparty: 'TANESCO UMEME' }, 'Electricity & LUKU'],
    [{ type: 'BILL_PAYMENT', counterparty: 'DAWASA' }, 'Bills & fees'],
    [{ type: 'SENT' }, 'Payments to people'],
    [{ type: 'TRANSFER' }, 'Payments to people'],
    [{ type: 'DEPOSIT' }, 'Deposits'],
    [{ type: 'RECEIVED', counterparty: 'PAYROLL BATCH' }, 'Salary'],
    [{ type: 'RECEIVED', counterparty: 'MSHAHARA JULAI' }, 'Salary'],
    [{ type: 'RECEIVED', counterparty: 'GRACE K.' }, 'Payments in'],
    [{ type: 'UNKNOWN' }, 'Other'],
  ])('%j is %p', (over, name) => {
    expect(categoryOf(t(over))).toBe(name);
  });

  it('breaks the demo spending down largest first', () => {
    const spend = categoryBreakdown(demo(), 'spend');
    expect(spend.total).toBe(208500);
    expect(spend.rows.map((r) => [r.name, r.amount, r.pct])).toEqual([
      ['Cash withdrawals', 120000, 58],
      ['Payments to people', 45000, 22],
      ['Electricity & LUKU', 38500, 18],
      ['Airtime & data', 5000, 2],
    ]);
  });

  it('breaks the demo income down largest first', () => {
    const earn = categoryBreakdown(demo(), 'earn');
    expect(earn.total).toBe(1450000);
    expect(earn.rows.map((r) => [r.name, r.pct])).toEqual([
      ['Salary', 83],
      ['Payments in', 17],
    ]);
  });

  it('reports a real zero total when empty (the prototype showed 1)', () => {
    expect(categoryBreakdown([], 'spend')).toEqual({ mode: 'spend', total: 0, rows: [] });
  });
});

describe('tips', () => {
  const h = computeHealth(demo())!;
  const spend = categoryBreakdown(demo(), 'spend');
  const earn = categoryBreakdown(demo(), 'earn');

  it('gives the demo ledger the design’s spending tips', () => {
    const tips = spendTips(h, spend);
    expect(tips.map((x) => x.title)).toEqual(['Cut down ATM trips', 'Set a weekly cap']);
    expect(tips[0].body).toContain('Cash is 58% of what you spend');
    expect(tips[0].why).toBe('TZS 120,000 taken out as cash');
  });

  it('caps the next biggest category when cash already has a tip', () => {
    const cap = spendTips(h, spend)[1];
    expect(cap.body).toMatch(/^Payments to people is 22% of your spending/);
  });

  it('counts one transaction as one, not "1 transactions"', () => {
    expect(spendTips(h, spend)[1].why).toBe('TZS 45,000 across 1 transaction');
  });

  it('gives the demo ledger the design’s income tips', () => {
    const tips = earnTips(h, earn, demo());
    expect(tips.map((x) => x.title)).toEqual([
      'One source carries 83%',
      'Ask for a reference every time',
      'Clear the review queue',
    ]);
    expect(tips[0].body).toMatch(/^Salary makes up most of your income/);
    expect(tips[1].body).toMatch(/^1 record carries no transaction number, so it cannot/);
    expect(tips[2].body).toMatch(/^3 records are still unconfirmed/);
  });

  it('suggests keeping more when little of the income is kept', () => {
    const tight = [t({ type: 'RECEIVED', amount: 1000 }), t({ type: 'SENT', amount: 900 })];
    const titles = spendTips(computeHealth(tight)!, categoryBreakdown(tight, 'spend')).map(
      (x) => x.title,
    );
    expect(titles).toContain('Aim to keep 35%');
  });

  it('only says one source carries most of the income when it does', () => {
    const even = [
      t({ type: 'RECEIVED', amount: 500, counterparty: 'PAYROLL' }),
      t({ type: 'RECEIVED', amount: 500, counterparty: 'GRACE K.' }),
    ];
    const tips = earnTips(computeHealth(even)!, categoryBreakdown(even, 'earn'), even);
    expect(tips.some((x) => x.title.startsWith('One source'))).toBe(false);
  });

  it('offers no spending tips when nothing was spent', () => {
    const incomeOnly = [t({ type: 'RECEIVED', amount: 1000 })];
    expect(spendTips(computeHealth(incomeOnly)!, categoryBreakdown(incomeOnly, 'spend'))).toEqual(
      [],
    );
  });

  it('promises no feature PesaIQ does not have', () => {
    const all = [...spendTips(h, spend), ...earnTips(h, earn, demo())]
      .map((x) => `${x.title} ${x.body} ${x.why}`)
      .join(' ')
      .toLowerCase();
    for (const promise of ['will tell you', 'will notify', 'we will alert', 'loan', 'tax']) {
      expect(all).not.toContain(promise);
    }
  });
});

describe('providerSummary', () => {
  it('sums what moved through each provider, largest first', () => {
    expect(providerSummary(demo()).map((r) => [r.name, r.count, r.amount])).toEqual([
      ['Demo Bank', 2, 1320000],
      ['Wallet A (M-Pesa-like demo)', 2, 288500],
      ['Wallet B (Airtel-like demo)', 1, 45000],
      [UNRECOGNIZED_PROVIDER, 1, 5000],
    ]);
  });

  it('leaves out ignored records', () => {
    expect(providerSummary([t({ status: 'IGNORED' })])).toEqual([]);
  });
});

describe('activityStreak', () => {
  // Local wall-clock times, so the tests hold in any timezone.
  const at = (month: number, day: number, hour = 10) =>
    new Date(2026, month - 1, day, hour).toISOString();
  const now = new Date(2026, 8, 11, 9);

  it('counts consecutive active days ending today', () => {
    expect(activityStreak([at(9, 11), at(9, 10), at(9, 9)], now)).toBe(3);
  });

  it('keeps a streak alive when the last activity was yesterday', () => {
    expect(activityStreak([at(9, 10), at(9, 9)], now)).toBe(2);
  });

  it('breaks at the first missed day', () => {
    expect(activityStreak([at(9, 11), at(9, 9), at(9, 8)], now)).toBe(1);
  });

  it('is zero once a whole day has passed with nothing done', () => {
    expect(activityStreak([at(9, 9), at(9, 8)], now)).toBe(0);
    expect(activityStreak([], now)).toBe(0);
  });

  it('counts a busy day once', () => {
    expect(activityStreak([at(9, 11, 8), at(9, 11, 12), at(9, 11, 20)], now)).toBe(1);
  });

  it('ignores timestamps it cannot read', () => {
    expect(activityStreak(['not a date', at(9, 11)], now)).toBe(1);
  });
});

describe('dashboard date and greeting', () => {
  it('writes the date line in full', () => {
    expect(formatLongDate(new Date(2026, 8, 11))).toBe('Friday, 11 September 2026');
    expect(formatLongDate(new Date(2026, 2, 12))).toBe('Thursday, 12 March 2026');
  });

  it.each([
    [6, 'Good morning'],
    [11, 'Good morning'],
    [12, 'Good afternoon'],
    [16, 'Good afternoon'],
    [17, 'Good evening'],
    [23, 'Good evening'],
  ])('greets at %p:00 with %p', (hour, greeting) => {
    expect(greetingFor(new Date(2026, 8, 11, hour))).toBe(greeting);
  });
});
