import {
  clearedThisWeek,
  confidenceLabel,
  REVIEW_TYPE_OPTIONS,
  REVIEW_WEEKLY_TARGET,
  reviewFields,
  reviewQueue,
  reviewTypeOptions,
  startOfWeek,
} from '../features/review/queue';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';

const demo = (): Transaction[] => DEMO_RECORDS.map((r) => r.transaction);
const t = (over: Partial<Transaction>): Transaction => ({
  ...DEMO_RECORDS[0].transaction,
  id: 'x',
  isDemo: false,
  ...over,
});
// Local wall-clock times, so the tests hold in any timezone.
const at = (month: number, day: number, hour = 10) =>
  new Date(2026, month - 1, day, hour).toISOString();

describe('reviewQueue', () => {
  it('holds only records that need review, newest transaction first', () => {
    expect(reviewQueue(demo()).map((x) => x.id)).toEqual(['demo-t3', 'demo-t4']);
  });

  it('drops a record once it is confirmed or ignored', () => {
    const list = demo().map((x) => (x.id === 'demo-t3' ? { ...x, status: 'IGNORED' as const } : x));
    expect(reviewQueue(list).map((x) => x.id)).toEqual(['demo-t4']);
  });
});

describe('startOfWeek', () => {
  // 11 September 2026 is a Friday.
  it('starts the week on Monday at midnight', () => {
    expect(startOfWeek(new Date(2026, 8, 12, 15))).toEqual(new Date(2026, 8, 7));
  });

  it('counts Sunday as the end of a week, not the start', () => {
    expect(startOfWeek(new Date(2026, 8, 13, 9))).toEqual(new Date(2026, 8, 7));
  });

  it('is the same day on a Monday', () => {
    expect(startOfWeek(new Date(2026, 8, 14, 0, 5))).toEqual(new Date(2026, 8, 14));
  });
});

describe('clearedThisWeek', () => {
  const now = new Date(2026, 8, 12, 15);

  it('counts review actions since Monday midnight', () => {
    expect(clearedThisWeek([at(9, 12), at(9, 9), at(9, 7, 0)], now)).toBe(3);
  });

  it('leaves out last week', () => {
    expect(clearedThisWeek([at(9, 6, 23), at(9, 1)], now)).toBe(0);
  });

  it('ignores timestamps it cannot read', () => {
    expect(clearedThisWeek(['not a date', at(9, 12)], now)).toBe(1);
  });

  it('keeps the design’s weekly target of 7', () => {
    expect(REVIEW_WEEKLY_TARGET).toBe(7);
  });
});

describe('reviewFields', () => {
  it('always asks about amount, counterparty and reference', () => {
    expect(reviewFields(t({ lowFields: [] }))).toEqual(['amount', 'counterparty', 'reference']);
  });

  it('also asks about any other field the parser flagged', () => {
    expect(reviewFields(t({ lowFields: ['date', 'counterparty', 'balance'] }))).toEqual([
      'amount',
      'counterparty',
      'reference',
      'date',
      'balance',
    ]);
  });

  it('never asks for the masked number or the type as text', () => {
    expect(reviewFields(t({ lowFields: ['masked', 'category'] }))).toEqual([
      'amount',
      'counterparty',
      'reference',
    ]);
  });
});

describe('reviewTypeOptions', () => {
  it('offers the design’s five types', () => {
    expect(REVIEW_TYPE_OPTIONS).toEqual([
      'RECEIVED',
      'SENT',
      'WITHDRAWAL',
      'AIRTIME',
      'BILL_PAYMENT',
    ]);
  });

  it('adds the record’s own type when it is not one of the five', () => {
    expect(reviewTypeOptions('DEPOSIT')).toEqual([...REVIEW_TYPE_OPTIONS, 'DEPOSIT']);
    expect(reviewTypeOptions('SENT')).toEqual([...REVIEW_TYPE_OPTIONS]);
  });
});

describe('confidenceLabel', () => {
  it('says how many fields to check instead of a bare "Very high"', () => {
    expect(confidenceLabel(0.98, 1, 'band-first')).toEqual({
      text: '98% overall · 1 to check',
      needsCheck: true,
    });
    expect(confidenceLabel(0.9, 2, 'pct-first').text).toBe('90% overall · 2 to check');
  });

  it('reads exactly as before when nothing is flagged', () => {
    expect(confidenceLabel(0.96, 0, 'band-first')).toEqual({
      text: 'Very high · 96%',
      needsCheck: false,
    });
    expect(confidenceLabel(0.96, 0, 'pct-first')).toEqual({
      text: '96% · Very high',
      needsCheck: false,
    });
  });

  it('still asks for a check when the score itself is low', () => {
    expect(confidenceLabel(0.62, 0, 'pct-first')).toEqual({
      text: '62% · Medium',
      needsCheck: true,
    });
  });
});
