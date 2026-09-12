import { changeText, reportFilename, reportHtml } from '../features/reports/html';
import {
  canGoForward,
  customRange,
  formatDayInput,
  monthOf,
  parseDayInput,
  presetRange,
  previousPeriod,
  rangeLabel,
  resolvePeriod,
  shiftMonth,
} from '../features/reports/period';
import { buildReport, changeOf } from '../features/reports/summary';
import type { TaxLine } from '../features/parser/schema';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';

const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe('report periods', () => {
  it('resolves a month to its first moment and the first moment after', () => {
    expect(resolvePeriod({ kind: 'month', year: 2026, month: 8 })).toEqual({
      from: day(2026, 9, 1),
      to: day(2026, 10, 1),
      label: 'September 2026',
    });
  });

  it('compares a month with the month before, across a new year', () => {
    expect(previousPeriod({ kind: 'month', year: 2026, month: 0 })).toEqual({
      kind: 'month',
      year: 2025,
      month: 11,
    });
  });

  it('compares a custom range with the same number of days just before it', () => {
    const range = customRange(day(2026, 9, 1), day(2026, 9, 15))!;
    expect(resolvePeriod(previousPeriod(range))).toMatchObject({
      from: day(2026, 8, 17),
      to: day(2026, 9, 1),
      label: '17–31 Aug 2026',
    });
  });

  it('labels ranges compactly', () => {
    expect(rangeLabel(day(2026, 9, 12), day(2026, 9, 12))).toBe('12 Sep 2026');
    expect(rangeLabel(day(2026, 9, 1), day(2026, 9, 15))).toBe('1–15 Sep 2026');
    expect(rangeLabel(day(2026, 8, 28), day(2026, 9, 3))).toBe('28 Aug – 3 Sep 2026');
    expect(rangeLabel(day(2025, 12, 28), day(2026, 1, 3))).toBe('28 Dec 2025 – 3 Jan 2026');
  });

  it('covers both days of a custom range in full, and refuses one that runs backwards', () => {
    expect(resolvePeriod(customRange(day(2026, 9, 1), day(2026, 9, 1))!).to).toEqual(
      day(2026, 9, 2),
    );
    expect(customRange(day(2026, 9, 5), day(2026, 9, 1))).toBeNull();
  });

  it('ends every preset with today', () => {
    const now = new Date(2026, 8, 12, 18, 30);
    expect(resolvePeriod(presetRange('last7', now)).label).toBe('6–12 Sep 2026');
    expect(resolvePeriod(presetRange('last30', now)).label).toBe('14 Aug – 12 Sep 2026');
    expect(resolvePeriod(presetRange('thisYear', now)).label).toBe('1 Jan – 12 Sep 2026');
  });

  it('steps months and stops at the current one', () => {
    const now = new Date(2026, 8, 12);
    const sep = monthOf(now);
    expect(canGoForward(sep, now)).toBe(false);
    const aug = shiftMonth(sep, -1);
    expect(aug).toEqual({ kind: 'month', year: 2026, month: 7 });
    expect(canGoForward(aug, now)).toBe(true);
  });

  it('reads typed days day-first, and only real ones', () => {
    expect(parseDayInput('12/09/2026')).toEqual(day(2026, 9, 12));
    expect(parseDayInput('1.9.26')).toEqual(day(2026, 9, 1));
    expect(parseDayInput('31/02/2026')).toBeNull();
    expect(parseDayInput('2026-09-12')).toBeNull();
    expect(formatDayInput(day(2026, 9, 1))).toBe('01/09/2026');
  });
});

const tax = (code: TaxLine['code'], amount: number, within: TaxLine['within']): TaxLine => ({
  code,
  amount,
  ratePct: null,
  within,
});

let n = 0;
const t = (over: Partial<Transaction>): Transaction => ({
  ...DEMO_RECORDS[0].transaction,
  id: `r${++n}`,
  status: 'CONFIRMED',
  isDemo: false,
  fee: null,
  taxes: [],
  ...over,
});

const RECORDS = [
  t({ type: 'RECEIVED', amount: 100000, moneyCategory: 'SALARY', transactionDate: '05 Sep 2026' }),
  t({
    type: 'SENT',
    amount: 5000,
    moneyCategory: 'FOOD_SHOPPING',
    fee: 450,
    taxes: [tax('VAT', 69, 'fee')],
    transactionDate: '12 Sep 2026',
  }),
  t({
    type: 'BILL_PAYMENT',
    amount: 20000,
    moneyCategory: 'ELECTRICITY_WATER',
    taxes: [
      tax('VAT', 2729.5, 'amount'),
      tax('EWURA', 151.64, 'amount'),
      tax('REA', 454.92, 'amount'),
    ],
    transactionDate: '12 Sep 2026',
  }),
  t({
    type: 'SENT',
    amount: 2000,
    moneyCategory: 'OTHER_SPENDING',
    status: 'NEEDS_REVIEW',
    transactionDate: '03 Sep 2026',
  }),
  t({
    type: 'RECEIVED',
    amount: 1000,
    moneyCategory: 'RECEIVED_FROM_PEOPLE',
    isDemo: true,
    transactionDate: '01 Sep 2026',
  }),
  t({ type: 'SENT', amount: 999999, status: 'IGNORED', transactionDate: '10 Sep 2026' }),
  t({
    type: 'WITHDRAWAL',
    amount: 50000,
    moneyCategory: 'CASH_WITHDRAWAL',
    fee: 1500,
    taxes: [tax('VAT', 229, 'fee')],
    transactionDate: '02 Aug 2026',
  }),
  t({ type: 'SENT', amount: 8000, moneyCategory: 'FOOD_SHOPPING', transactionDate: '20 Aug 2026' }),
];

describe('buildReport', () => {
  const r = buildReport(RECORDS, { kind: 'month', year: 2026, month: 8 });

  it('totals the period, net after spending, fees and taxes', () => {
    expect(r.period.label).toBe('September 2026');
    expect(r.previous.label).toBe('August 2026');
    expect(r.totals).toEqual({
      received: 101000,
      spent: 23663.94,
      charges: 3786.06,
      operatorFees: 381,
      taxes: 3405.06,
      net: 73550,
      count: 5,
    });
    expect(r.previousTotals).toEqual({
      received: 0,
      spent: 58000,
      charges: 1500,
      operatorFees: 1271,
      taxes: 229,
      net: -59500,
      count: 2,
    });
  });

  it('splits fees & taxes into operator fees (fees less their VAT) and taxes', () => {
    // Mixx: fee 450 with VAT 69 inside it, so the operator charged 381.
    expect(r.totals.operatorFees).toBe(381);
    expect(r.totals.operatorFees + r.totals.taxes).toBeCloseTo(r.totals.charges, 2);
    expect(r.previousTotals.operatorFees + r.previousTotals.taxes).toBeCloseTo(
      r.previousTotals.charges,
      2,
    );
  });

  it('breaks spending down by category, with what stopped since last month', () => {
    expect(r.spending.map((l) => [l.label, l.amount, l.previous])).toEqual([
      ['Electricity & water', 16663.94, 0],
      ['Food & shopping', 5000, 8000],
      ['Other spending', 2000, 0],
      ['Cash withdrawal', 0, 50000],
    ]);
    expect(r.spending.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 6);
  });

  it('breaks income down by category', () => {
    expect(r.income.map((l) => [l.label, l.amount])).toEqual([
      ['Salary', 100000],
      ['Received from people', 1000],
    ]);
  });

  it('breaks fees and taxes down by type, adding up to the total', () => {
    expect(r.fees.map((l) => [l.key, l.amount, l.previous])).toEqual([
      ['VAT', 2798.5, 229],
      ['REA', 454.92, 0],
      ['OPERATOR_FEE', 381, 1271],
      ['EWURA', 151.64, 0],
    ]);
    expect(r.fees.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(r.totals.charges, 2);
  });

  it('counts what still needs review and flags demo records', () => {
    expect(r.needsReview).toBe(1);
    expect(r.demoCount).toBe(1);
  });

  it('is empty, not broken, for a period with nothing in it', () => {
    const empty = buildReport(RECORDS, { kind: 'month', year: 2026, month: 5 });
    expect(empty.totals).toEqual({
      received: 0,
      spent: 0,
      charges: 0,
      operatorFees: 0,
      taxes: 0,
      net: 0,
      count: 0,
    });
    expect(empty.spending).toEqual([]);
  });
});

describe('changes', () => {
  it('measures change against the period before', () => {
    expect(changeOf(120, 100)).toEqual({ delta: 20, pct: 0.2 });
    expect(changeOf(50, 0)).toEqual({ delta: 50, pct: null });
    expect(changeText(120, 100)).toBe('+20%');
    expect(changeText(80, 100)).toBe('−20%');
    expect(changeText(50, 0)).toBe('new');
    expect(changeText(0, 0)).toBe('—');
  });
});

describe('reportHtml', () => {
  const html = reportHtml(
    buildReport(RECORDS, { kind: 'month', year: 2026, month: 8 }),
    day(2026, 9, 12),
  );

  it('carries the totals, the sections and the comparison', () => {
    expect(html).toContain('Monthly summary · September 2026');
    expect(html).toContain('Compared with August 2026');
    expect(html).toContain('TZS 101,000');
    expect(html).toContain('+TZS 73,550');
    expect(html).toContain('Electricity &amp; water');
    expect(html).toContain('Fees &amp; taxes by type');
    expect(html).toContain('<td>Operator fees</td><td class="num">TZS 381</td>');
    expect(html).toContain('<td>Taxes</td><td class="num">TZS 3,405.06</td>');
  });

  it('says what it is not, and flags demo records and pending reviews', () => {
    expect(html).toContain('not a bank statement or a tax document');
    expect(html).toContain('Includes 1 invented demo sample record');
    expect(html).toContain('1 record is still waiting for review');
  });

  it('carries no names, numbers or references', () => {
    expect(html).not.toMatch(/JOHN|07\*\*|QH42T8LM9P/);
  });

  it('names the file after the period', () => {
    expect(reportFilename(buildReport(RECORDS, { kind: 'month', year: 2026, month: 8 }))).toBe(
      'pesaiq-summary-2026-09.pdf',
    );
    expect(
      reportFilename(buildReport(RECORDS, customRange(day(2026, 9, 1), day(2026, 9, 15))!)),
    ).toBe('pesaiq-summary-2026-09-01-to-2026-09-15.pdf');
  });

  it('escapes anything that could be read as markup', () => {
    const tricky = buildReport(
      [
        t({
          type: 'SENT',
          amount: 100,
          moneyCategory: null,
          counterparty: '<b>X</b>',
          transactionDate: '12 Sep 2026',
        }),
      ],
      { kind: 'month', year: 2026, month: 8 },
    );
    expect(reportHtml(tricky, day(2026, 9, 12))).not.toContain('<b>X</b>');
  });
});
