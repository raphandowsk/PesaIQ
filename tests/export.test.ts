import {
  CSV_HEADER,
  csvRow,
  csvText,
  exportDate,
  JSON_NOTES,
  planExport,
  selectForExport,
  toCsv,
} from '../features/export/format';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';
import { TYPE_LABELS } from '../types/domain';

// Every value here is invented; no real message or person.
const mine = (over: Partial<Transaction> = {}): Transaction => ({
  ...DEMO_RECORDS[0].transaction,
  id: 'u1',
  isDemo: false,
  ...over,
});
const demo = (): Transaction[] => DEMO_RECORDS.map((r) => r.transaction);
const NOW = new Date(2026, 2, 20, 12);

describe('csvText', () => {
  it('leaves ordinary text alone and empties missing values', () => {
    expect(csvText('JOHN M.')).toBe('JOHN M.');
    expect(csvText(null)).toBe('');
    expect(csvText(undefined)).toBe('');
  });

  it('quotes commas, quotes and line breaks, doubling inner quotes', () => {
    expect(csvText('Mwanza, TZ')).toBe('"Mwanza, TZ"');
    expect(csvText('the "shop"')).toBe('"the ""shop"""');
    expect(csvText('two\nlines')).toBe('"two\nlines"');
  });

  it('defuses anything a spreadsheet would run as a formula', () => {
    expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvText('+255')).toBe("'+255");
    expect(csvText('-5')).toBe("'-5");
    expect(csvText('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('keeps leading and trailing spaces by quoting them', () => {
    expect(csvText(' padded ')).toBe('" padded "');
  });
});

describe('CSV', () => {
  it('uses the brief’s header exactly', () => {
    expect(CSV_HEADER.join(',')).toBe(
      'Date,Type,Provider,Amount,Currency,Sender,Reference,Confidence',
    );
  });

  it('writes a record as an ISO date, plain number and two-place confidence', () => {
    expect(csvRow(mine())).toBe(
      `2026-03-12,${TYPE_LABELS.RECEIVED},Wallet A (M-Pesa-like demo),250000,TZS,JOHN M.,QH42T8LM9P,0.96`,
    );
  });

  it('leaves missing values empty rather than inventing them', () => {
    const row = csvRow(
      mine({
        transactionDate: null,
        provider: null,
        counterparty: null,
        transactionReference: null,
      }),
    );
    expect(row).toBe(`,${TYPE_LABELS.RECEIVED},,250000,TZS,,,0.96`);
  });

  it('uses CRLF line endings and ends with one', () => {
    expect(toCsv([mine()])).toBe(`${CSV_HEADER.join(',')}\r\n${csvRow(mine())}\r\n`);
  });
});

describe('exportDate', () => {
  it('is the date read from the message', () => {
    expect(exportDate(mine())).toBe('2026-03-12');
  });

  it('is null when the message had no readable date, not the day it was saved', () => {
    expect(exportDate(mine({ transactionDate: null }))).toBeNull();
    expect(exportDate(mine({ transactionDate: 'sometime' }))).toBeNull();
  });
});

describe('selectForExport', () => {
  it('leaves demo samples out, and counts them', () => {
    const all = [...demo(), mine()];
    expect(selectForExport(all, 'all', NOW)).toEqual({ rows: [mine()], demoLeftOut: 6 });
  });

  it('keeps only the range, measured from today', () => {
    const recent = mine({ id: 'u2', transactionDate: '18 Mar 2026' });
    const older = mine({ id: 'u3', transactionDate: '01 Mar 2026' });
    const ids = (range: '7d' | '30d' | 'all') =>
      selectForExport([older, recent], range, NOW).rows.map((t) => t.id);

    expect(ids('7d')).toEqual(['u2']);
    expect(ids('30d')).toEqual(['u2', 'u3']);
    expect(ids('all')).toEqual(['u2', 'u3']);
  });
});

describe('planExport', () => {
  const records = [
    mine({ id: 'a', transactionDate: '19 Mar 2026' }),
    mine({ id: 'b', transactionDate: '18 Mar 2026' }),
    mine({ id: 'c', transactionDate: '17 Mar 2026' }),
    mine({ id: 'd', transactionDate: '16 Mar 2026' }),
  ];

  it('names and types a CSV, with a BOM for Excel', () => {
    const plan = planExport(records, 'CSV', 'all', NOW);
    expect(plan.filename).toBe('pesaiq-export-2026-03-20.csv');
    expect(plan.mimeType).toBe('text/csv');
    expect(plan.content.startsWith('﻿Date,Type')).toBe(true);
    expect(plan.count).toBe(4);
  });

  it('previews the header and the first three rows, without the BOM', () => {
    const lines = planExport(records, 'CSV', 'all', NOW).preview.split('\n');
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe(CSV_HEADER.join(','));
    expect(lines[1].startsWith('2026-03-19,')).toBe(true);
  });

  it('writes JSON that explains itself and never carries message text', () => {
    const plan = planExport(records, 'JSON', '30d', NOW);
    const doc = JSON.parse(plan.content);

    expect(plan.filename).toBe('pesaiq-export-2026-03-20.json');
    expect(plan.mimeType).toBe('application/json');
    expect(doc).toMatchObject({ app: 'PesaIQ', range: '30d', count: 4, notes: [...JSON_NOTES] });
    expect(doc.records[0]).toMatchObject({
      id: 'a',
      date: '2026-03-19',
      type: 'RECEIVED',
      amount: 250000,
      maskedAccountOrPhone: '07** *** 678',
      confidence: 0.96,
    });
    expect(plan.content).not.toContain('0712345678');
    expect(plan.content).not.toMatch(/sourceMessage|originalText|messageText/);
  });

  it('previews two JSON records', () => {
    expect(JSON.parse(planExport(records, 'JSON', 'all', NOW).preview)).toHaveLength(2);
  });

  it('with nothing to export, still previews the header', () => {
    const plan = planExport(demo(), 'CSV', 'all', NOW);
    expect(plan.count).toBe(0);
    expect(plan.demoLeftOut).toBe(6);
    expect(plan.preview).toBe(CSV_HEADER.join(','));
  });
});
