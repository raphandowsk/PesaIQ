import { EMPTY_DETAILS } from '../features/parser/schema';
import { isCounted, needsReview, summarize } from '../features/transactions/selectors';
import type { Transaction } from '../features/transactions/model';

const t = (over: Partial<Transaction>): Transaction => ({
  id: 'x',
  type: 'RECEIVED',
  status: 'CONFIRMED',
  provider: null,
  providerId: null,
  amount: 1000,
  currency: 'TZS',
  counterparty: null,
  maskedAccountOrPhone: null,
  transactionReference: null,
  balanceAfter: null,
  transactionDate: null,
  transactionTime: null,
  moneyCategory: null,
  fee: null,
  taxes: [],
  details: EMPTY_DETAILS,
  confidence: 0.9,
  lowFields: [],
  sourceMessageId: null,
  parseResultId: null,
  isDemo: false,
  createdAt: '2026-09-11T00:00:00Z',
  updatedAt: '2026-09-11T00:00:00Z',
  ...over,
});

describe('summarize', () => {
  it('adds incoming and outgoing separately', () => {
    const s = summarize([
      t({ type: 'RECEIVED', amount: 250000 }),
      t({ type: 'DEPOSIT', amount: 50000 }),
      t({ type: 'SENT', amount: 45000 }),
      t({ type: 'WITHDRAWAL', amount: 120000 }),
      t({ type: 'BILL_PAYMENT', amount: 38500 }),
    ]);
    expect(s.received).toBe(300000);
    expect(s.sent).toBe(203500);
    expect(s.net).toBe(96500);
    expect(s.count).toBe(5);
  });

  it('leaves out ignored and failed records entirely', () => {
    const s = summarize([
      t({ amount: 1000 }),
      t({ amount: 999999, status: 'IGNORED' }),
      t({ amount: 999999, status: 'FAILED' }),
    ]);
    expect(s.received).toBe(1000);
    expect(s.count).toBe(1);
  });

  it('still counts records waiting for review', () => {
    const s = summarize([t({ amount: 5000, status: 'NEEDS_REVIEW' })]);
    expect(s.received).toBe(5000);
    expect(s.needsReview).toBe(1);
  });

  it('counts a record with no amount but adds nothing for it', () => {
    const s = summarize([t({ amount: null, status: 'NEEDS_REVIEW' })]);
    expect(s.count).toBe(1);
    expect(s.received).toBe(0);
  });

  it('puts an UNKNOWN type in neither column', () => {
    const s = summarize([t({ type: 'UNKNOWN', amount: 7000 })]);
    expect(s.received).toBe(0);
    expect(s.sent).toBe(0);
  });

  it('is all zeros for an empty list', () => {
    expect(summarize([])).toEqual({
      received: 0,
      sent: 0,
      charges: 0,
      totalOut: 0,
      net: 0,
      count: 0,
      needsReview: 0,
    });
  });
});

describe('isCounted / needsReview', () => {
  it('excludes only ignored and failed', () => {
    expect(isCounted(t({ status: 'PARSED' }))).toBe(true);
    expect(isCounted(t({ status: 'NEEDS_REVIEW' }))).toBe(true);
    expect(isCounted(t({ status: 'IGNORED' }))).toBe(false);
    expect(isCounted(t({ status: 'FAILED' }))).toBe(false);
  });

  it('picks out the review queue', () => {
    const list = [
      t({ id: 'a', status: 'NEEDS_REVIEW' }),
      t({ id: 'b' }),
      t({ id: 'c', status: 'NEEDS_REVIEW' }),
    ];
    expect(needsReview(list).map((x) => x.id)).toEqual(['a', 'c']);
  });
});
