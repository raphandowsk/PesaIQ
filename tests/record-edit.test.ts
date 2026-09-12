import { LAB_SAVE_ERRORS } from '../features/lab/draft';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import type { Transaction } from '../features/transactions/model';
import {
  buildRecordPatch,
  canConfirm,
  NO_RECORD_EDITS,
  recordEditViews,
  recordFields,
  type RecordEdits,
} from '../features/transactions/editRecord';

const byId = (id: string): Transaction =>
  DEMO_RECORDS.find((r) => r.transaction.id === id)!.transaction;
const atm = () => byId('demo-t3'); // counterparty flagged as unsure
const airtime = () => byId('demo-t4'); // no counterparty, no reference
const edits = (text: RecordEdits['text'], type?: RecordEdits['type']): RecordEdits => ({
  text,
  type,
});

describe('recordFields', () => {
  it('lists the design’s rows in order, formatted', () => {
    expect(recordFields(atm()).map((f) => [f.label, f.display])).toEqual([
      ['Provider', 'Demo Bank'],
      ['Amount', 'TZS 120,000'],
      ['Counterparty', 'ATM withdrawal'],
      ['Account / phone', '**** 4312'],
      ['Reference', 'BK7741902'],
      ['Balance after', 'TZS 2,415,300'],
      ['Date', '11 Mar 2026 · 09:07'],
    ]);
  });

  it('flags the fields the parser was unsure about', () => {
    const low = recordFields(atm())
      .filter((f) => f.low)
      .map((f) => f.key);
    expect(low).toEqual(['counterparty']);
  });

  it('shows what is missing as missing', () => {
    const f = recordFields(airtime()).find((x) => x.key === 'reference')!;
    expect(f).toMatchObject({ display: 'Not found', missing: true, low: true });
  });
});

describe('recordEditViews', () => {
  it('puts a type picker first and keeps the masked number read-only', () => {
    const views = recordEditViews(atm(), NO_RECORD_EDITS);
    expect(views[0]).toMatchObject({ key: 'category', editMode: 'type' });
    expect(views.find((v) => v.key === 'masked')!.editMode).toBe('none');
    expect(views.find((v) => v.key === 'amount')).toMatchObject({ value: '120000', numeric: true });
  });

  it('clears the flag on a field once the user types into it', () => {
    const views = recordEditViews(atm(), edits({ counterparty: 'CITY ATM' }));
    expect(views.find((v) => v.key === 'counterparty')).toMatchObject({
      value: 'CITY ATM',
      low: false,
      verified: true,
    });
  });
});

describe('buildRecordPatch', () => {
  it('finds nothing to change when nothing was changed', () => {
    expect(buildRecordPatch(atm(), NO_RECORD_EDITS)).toEqual({
      ok: true,
      patch: {},
      editedKeys: [],
    });
  });

  it('does not count a field typed back to its saved value', () => {
    const r = buildRecordPatch(atm(), edits({ counterparty: ' ATM withdrawal ' }));
    expect(r).toMatchObject({ ok: true, editedKeys: [] });
  });

  it('applies a corrected name and amount', () => {
    const r = buildRecordPatch(atm(), edits({ counterparty: 'CITY ATM', amount: '130,000' }));
    expect(r).toEqual({
      ok: true,
      patch: { counterparty: 'CITY ATM', amount: 130000, currency: 'TZS' },
      editedKeys: ['amount', 'counterparty'],
    });
  });

  it.each([
    ['abc', LAB_SAVE_ERRORS.badAmount],
    ['', LAB_SAVE_ERRORS.noAmount],
    ['0', LAB_SAVE_ERRORS.zeroAmount],
  ])('rejects an amount of %p', (amount, error) => {
    expect(buildRecordPatch(atm(), edits({ amount }))).toMatchObject({ ok: false, error });
  });

  it('refuses to save a record that still has no amount', () => {
    const noAmount = { ...airtime(), amount: null };
    expect(buildRecordPatch(noAmount, edits({ counterparty: 'VODA' }))).toMatchObject({
      ok: false,
      error: LAB_SAVE_ERRORS.noAmount,
    });
  });

  it('rejects a non-numeric balance but allows clearing it', () => {
    expect(buildRecordPatch(atm(), edits({ balance: 'lots' }))).toMatchObject({
      ok: false,
      error: LAB_SAVE_ERRORS.badBalance,
    });
    expect(buildRecordPatch(atm(), edits({ balance: '' }))).toMatchObject({
      ok: true,
      patch: { balanceAfter: null },
    });
  });

  it('drops the detected provider id when the name is retyped', () => {
    expect(buildRecordPatch(atm(), edits({ provider: 'CRDB' }))).toMatchObject({
      ok: true,
      patch: { provider: 'CRDB', providerId: null },
    });
  });

  it('clears the time along with a cleared date', () => {
    expect(buildRecordPatch(atm(), edits({ date: '' }))).toMatchObject({
      ok: true,
      patch: { transactionDate: null, transactionTime: null },
    });
  });

  it('records a type change as an edit to the Type field', () => {
    expect(buildRecordPatch(atm(), edits({}, 'TRANSFER'))).toMatchObject({
      ok: true,
      patch: { type: 'TRANSFER' },
      editedKeys: ['category'],
    });
  });
});

describe('canConfirm', () => {
  it('needs an amount above zero', () => {
    expect(canConfirm(atm())).toBe(true);
    expect(canConfirm({ ...atm(), amount: null })).toBe(false);
    expect(canConfirm({ ...atm(), amount: 0 })).toBe(false);
  });
});
