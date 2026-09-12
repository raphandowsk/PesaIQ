import { chargeLines, feePeriodRange, feesSummary } from '../features/insights/fees';
import { UNRECOGNIZED_PROVIDER } from '../features/insights/providers';
import type { TaxLine } from '../features/parser/schema';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';
import { chargesOf, feeBeforeTaxOf, spentOf, totalOutOf } from '../features/transactions/money';
import { summarize } from '../features/transactions/selectors';

const tax = (
  code: TaxLine['code'],
  amount: number,
  within: TaxLine['within'],
  ratePct: number | null = null,
): TaxLine => ({ code, amount, ratePct, within });

const t = (over: Partial<Transaction>): Transaction => ({
  ...DEMO_RECORDS[1].transaction,
  id: 'x',
  isDemo: false,
  fee: null,
  taxes: [],
  ...over,
});

const sum = (lines: { amount: number }[]) => lines.reduce((s, l) => s + l.amount, 0);

// The anonymized fixtures' figures (tests/fixtures/tz-messages.ts).
const mixx = t({
  id: 'mixx',
  type: 'SENT',
  amount: 5000,
  fee: 450,
  taxes: [tax('VAT', 69, 'fee')],
  provider: 'Mixx by Yas',
  transactionDate: '12 Sep 2026',
});
const luku = t({
  id: 'luku',
  type: 'BILL_PAYMENT',
  amount: 20000,
  provider: null,
  transactionDate: '12 Sep 2026',
  taxes: [
    tax('VAT', 2729.5, 'amount', 18),
    tax('EWURA', 151.64, 'amount', 1),
    tax('REA', 454.92, 'amount', 3),
  ],
});
const withdrawal = t({
  id: 'withdrawal',
  type: 'WITHDRAWAL',
  amount: 50000,
  fee: 1500,
  taxes: [tax('VAT', 229, 'fee')],
  provider: 'Mixx by Yas',
  transactionDate: '02 Aug 2026',
});

describe('what a record cost', () => {
  it('reconciles a Mixx transfer: spent + fees and taxes = total out', () => {
    expect(spentOf(mixx)).toBe(5000);
    expect(chargesOf(mixx)).toBe(450);
    expect(totalOutOf(mixx)).toBe(5450);
    expect(feeBeforeTaxOf(mixx)).toBe(381);
  });

  it('reconciles a LUKU receipt, whose taxes sit inside the total', () => {
    expect(chargesOf(luku)).toBe(3336.06);
    expect(spentOf(luku)).toBe(16663.94);
    expect(totalOutOf(luku)).toBe(20000);
  });

  it('adds VAT charged on top of a fee to what left the balance', () => {
    const onTop = t({ amount: 1000, fee: 100, taxes: [tax('VAT', 18, 'extra')] });
    expect(spentOf(onTop)).toBe(1000);
    expect(chargesOf(onTop)).toBe(118);
    expect(totalOutOf(onTop)).toBe(1118);
  });
});

describe('summarize', () => {
  it('keeps fees and taxes apart from spending, and nets them off', () => {
    const s = summarize([mixx, luku, t({ id: 'in', type: 'RECEIVED', amount: 100000 })]);
    expect(s.sent).toBe(21663.94);
    expect(s.charges).toBe(3786.06);
    expect(s.totalOut).toBe(25450);
    expect(s.net).toBe(74550);
  });
});

describe('chargeLines', () => {
  it("splits a fee into the provider's part and the VAT inside it", () => {
    expect(chargeLines(mixx)).toEqual([
      { key: 'FEE', label: 'Transaction fees', amount: 381 },
      { key: 'VAT', label: 'VAT', amount: 69 },
    ]);
  });

  it('calls the fee on a cash withdrawal an agent fee', () => {
    expect(chargeLines(withdrawal)[0]).toEqual({
      key: 'AGENT_FEE',
      label: 'Agent fees',
      amount: 1271,
    });
  });

  it("always adds up to the record's fees and taxes", () => {
    for (const r of [mixx, luku, withdrawal]) {
      expect(sum(chargeLines(r))).toBeCloseTo(chargesOf(r), 2);
    }
  });
});

describe('feesSummary', () => {
  const now = new Date(2026, 8, 20);
  const records = [
    mixx,
    luku,
    withdrawal,
    t({ id: 'ignored', status: 'IGNORED', fee: 999, transactionDate: '12 Sep 2026' }),
    t({ id: 'free', transactionDate: '12 Sep 2026' }),
  ];

  it('totals the period, leaving out ignored and fee-free records', () => {
    const s = feesSummary(records, 'month', now);
    expect(s.records.map((r) => r.id).sort()).toEqual(['luku', 'mixx']);
    expect(s.total).toBe(3786.06);
  });

  it('breaks the total down by type, largest first, adding up exactly', () => {
    const s = feesSummary(records, 'month', now);
    expect(s.byType.map((r) => [r.key, r.amount])).toEqual([
      ['VAT', 2798.5],
      ['REA', 454.92],
      ['FEE', 381],
      ['EWURA', 151.64],
    ]);
    expect(sum(s.byType)).toBeCloseTo(s.total, 2);
  });

  it('breaks it down by provider', () => {
    const s = feesSummary(records, 'month', now);
    expect(s.byProvider.map((r) => [r.label, r.amount])).toEqual([
      [UNRECOGNIZED_PROVIDER, 3336.06],
      ['Mixx by Yas', 450],
    ]);
  });

  it('reads last month and all time', () => {
    expect(feesSummary(records, 'lastMonth', now).records.map((r) => r.id)).toEqual(['withdrawal']);
    expect(feesSummary(records, 'all', now).records).toHaveLength(3);
  });
});

describe('feePeriodRange', () => {
  it('uses calendar months, including across a new year', () => {
    expect(feePeriodRange('month', new Date(2026, 8, 20))).toEqual({
      from: new Date(2026, 8, 1),
      to: null,
    });
    expect(feePeriodRange('lastMonth', new Date(2026, 0, 15))).toEqual({
      from: new Date(2025, 11, 1),
      to: new Date(2026, 0, 1),
    });
    expect(feePeriodRange('all', new Date())).toEqual({ from: null, to: null });
  });
});
