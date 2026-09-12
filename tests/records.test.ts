import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';
import {
  DEFAULT_RECORD_QUERY,
  extraFilterCount,
  filterRecords,
  groupByDay,
  periodStart,
  providerOptions,
  RECORD_FILTERS,
  recordDate,
  type RecordQuery,
} from '../features/transactions/records';

const demo = (): Transaction[] => DEMO_RECORDS.map((r) => r.transaction);
// Local wall-clock times, so the tests hold in any timezone.
const NOW = new Date(2026, 2, 12, 18, 0);
const q = (over: Partial<RecordQuery>): RecordQuery => ({ ...DEFAULT_RECORD_QUERY, ...over });
const ids = (list: Transaction[]) => list.map((t) => t.id);
const t = (over: Partial<Transaction>): Transaction => ({
  ...DEMO_RECORDS[0].transaction,
  id: 'x',
  isDemo: false,
  ...over,
});

describe('recordDate', () => {
  it('reads the date and time the parser found', () => {
    expect(recordDate(demo()[0])).toEqual(new Date(2026, 2, 12, 14, 22));
  });

  it('uses midnight when a message gave a date but no time', () => {
    expect(recordDate(t({ transactionDate: '05 Mar 2026', transactionTime: null }))).toEqual(
      new Date(2026, 2, 5, 0, 0),
    );
  });

  it('falls back to when the record was saved', () => {
    const saved = '2026-03-01T09:30:00.000Z';
    for (const transactionDate of [null, 'last tuesday', '31 Feb 2026']) {
      expect(recordDate(t({ transactionDate, createdAt: saved })).toISOString()).toBe(saved);
    }
  });
});

describe('filterRecords', () => {
  it('shows everything, newest transaction first', () => {
    expect(ids(filterRecords(demo(), DEFAULT_RECORD_QUERY, NOW))).toEqual([
      'demo-t1',
      'demo-t2',
      'demo-t3',
      'demo-t4',
      'demo-t5',
      'demo-t6',
    ]);
  });

  it('orders by when it happened, not when it was saved', () => {
    const oldMessageSavedToday = t({
      id: 'late',
      transactionDate: '01 Jan 2026',
      createdAt: '2026-03-12T17:00:00.000Z',
    });
    const list = filterRecords([...demo(), oldMessageSavedToday], DEFAULT_RECORD_QUERY, NOW);
    expect(list[list.length - 1].id).toBe('late');
  });

  it('has the design’s chips, in its order', () => {
    expect(RECORD_FILTERS.map((f) => f.label)).toEqual([
      'All',
      'Received',
      'Sent',
      'Cash out',
      'Bills',
      'Review',
    ]);
  });

  it.each<[RecordQuery['filter'], string[]]>([
    ['received', ['demo-t1', 'demo-t5']],
    ['sent', ['demo-t2']],
    ['cashout', ['demo-t3']],
    ['bills', ['demo-t4', 'demo-t6']],
    ['review', ['demo-t3', 'demo-t4']],
  ])('the %s chip', (filter, expected) => {
    expect(ids(filterRecords(demo(), q({ filter }), NOW))).toEqual(expected);
  });

  it('searches name, reference, provider, masked number and amount, ignoring case', () => {
    const find = (search: string) => ids(filterRecords(demo(), q({ search }), NOW));
    expect(find('grace')).toEqual(['demo-t2']);
    expect(find('qh42')).toEqual(['demo-t1']);
    expect(find('DEMO BANK')).toEqual(['demo-t3', 'demo-t5']);
    expect(find('4312')).toEqual(['demo-t3', 'demo-t5']);
    expect(find('38,500')).toEqual(['demo-t6']);
    expect(find('38500')).toEqual(['demo-t6']);
    expect(find('nobody at all')).toEqual([]);
  });

  it('treats a blank search as no search', () => {
    expect(filterRecords(demo(), q({ search: '   ' }), NOW)).toHaveLength(6);
  });

  it('filters by provider, including records whose provider was not recognized', () => {
    expect(ids(filterRecords(demo(), q({ provider: 'Demo Bank' }), NOW))).toEqual([
      'demo-t3',
      'demo-t5',
    ]);
    expect(ids(filterRecords(demo(), q({ provider: 'Unrecognized sender' }), NOW))).toEqual([
      'demo-t4',
    ]);
  });

  it('filters by period, counting today as one of the days', () => {
    expect(ids(filterRecords(demo(), q({ period: '7d' }), NOW))).toEqual([
      'demo-t1',
      'demo-t2',
      'demo-t3',
      'demo-t4',
    ]);
    expect(filterRecords(demo(), q({ period: '30d' }), NOW)).toHaveLength(6);
    expect(filterRecords(demo(), q({ period: 'year' }), new Date(2027, 0, 5))).toHaveLength(0);
  });

  it('combines a chip with the extra filters', () => {
    expect(
      ids(filterRecords(demo(), q({ filter: 'received', provider: 'Demo Bank' }), NOW)),
    ).toEqual(['demo-t5']);
  });
});

describe('periodStart', () => {
  it('has no start for "any time"', () => {
    expect(periodStart('any', NOW)).toBeNull();
  });

  it('starts "this year" on 1 January', () => {
    expect(periodStart('year', NOW)).toEqual(new Date(2026, 0, 1));
  });

  it('counts back from the start of today', () => {
    expect(periodStart('7d', NOW)).toEqual(new Date(2026, 2, 6));
  });
});

describe('groupByDay', () => {
  it('groups by the day it happened, titled the way the parser writes dates', () => {
    const groups = groupByDay(filterRecords(demo(), DEFAULT_RECORD_QUERY, NOW));
    expect(groups.map((g) => [g.title, ids(g.data)])).toEqual([
      ['12 Mar 2026', ['demo-t1', 'demo-t2']],
      ['11 Mar 2026', ['demo-t3']],
      ['10 Mar 2026', ['demo-t4']],
      ['05 Mar 2026', ['demo-t5']],
      ['04 Mar 2026', ['demo-t6']],
    ]);
  });

  it('keeps one group per day even when given records out of order', () => {
    const [a, b, c] = demo();
    expect(groupByDay([a, c, b]).map((g) => g.title)).toEqual(['12 Mar 2026', '11 Mar 2026']);
  });

  it('is empty for no records', () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe('providerOptions and extraFilterCount', () => {
  it('lists providers present, most used first', () => {
    expect(providerOptions(demo())).toEqual([
      'Demo Bank',
      'Wallet A (M-Pesa-like demo)',
      'Unrecognized sender',
      'Wallet B (Airtel-like demo)',
    ]);
  });

  it('counts only the filters behind "More filters"', () => {
    expect(extraFilterCount(DEFAULT_RECORD_QUERY)).toBe(0);
    expect(extraFilterCount(q({ filter: 'sent', search: 'x' }))).toBe(0);
    expect(extraFilterCount(q({ provider: 'Demo Bank', period: '7d' }))).toBe(2);
  });
});
