import type { SqlDatabase } from '../database/client';
import {
  messageRepository,
  parseResultRepository,
  processingEventRepository,
} from '../database/repositories';
import { SAMPLES } from '../features/parser';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import { buildRecordPatch } from '../features/transactions/editRecord';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';
import { saveNew } from './support/save';

const NOW = '2026-09-11T12:00:00.000Z';
const app = () => useAppStore.getState();
const record = (id: string) => app().transactions.find((t) => t.id === id)!;

let db: SqlDatabase;
let n = 0;

beforeEach(async () => {
  db = await createMigratedDatabase();
  n = 0;
  await app().initialize({ database: db, now: () => NOW, makeId: (p) => `${p}-${++n}` });
});
afterEach(() => db.closeAsync());

describe('the source message behind a record', () => {
  it('returns the message a record came from', async () => {
    const t = DEMO_RECORDS[0].transaction;
    const source = await app().getRecordSource(t.sourceMessageId);
    expect(source).toEqual({ text: DEMO_RECORDS[0].messageText, sender: DEMO_RECORDS[0].sender });
  });

  it('returns nothing for a record with no stored message', async () => {
    expect(await app().getRecordSource(null)).toBeNull();
    expect(await app().getRecordSource('gone')).toBeNull();
  });
});

describe('deleting a record', () => {
  it('deletes its source message and parse result with it', async () => {
    const transaction = await saveNew(SAMPLES[1].text, SAMPLES[1].sender);
    expect(await messageRepository.findById(db, transaction.sourceMessageId!)).not.toBeNull();

    await app().remove(transaction.id);

    expect(await messageRepository.findById(db, transaction.sourceMessageId!)).toBeNull();
    expect(await parseResultRepository.findById(db, transaction.parseResultId!)).toBeNull();
    expect(app().transactions.find((t) => t.id === transaction.id)).toBeUndefined();
  });

  it('leaves every other record’s message in place', async () => {
    const before = await messageRepository.count(db);
    await app().remove(DEMO_RECORDS[0].transaction.id);
    expect(await messageRepository.count(db)).toBe(before - 1);
    expect(
      await messageRepository.findById(db, DEMO_RECORDS[1].transaction.sourceMessageId!),
    ).not.toBeNull();
  });

  it('keeps the message if another record still points at it', async () => {
    const shared = DEMO_RECORDS[0].transaction.sourceMessageId!;
    await db.runAsync('UPDATE transactions SET source_message_id = ? WHERE id = ?', [
      shared,
      DEMO_RECORDS[1].transaction.id,
    ]);
    await app().remove(DEMO_RECORDS[0].transaction.id);
    expect(await messageRepository.findById(db, shared)).not.toBeNull();
  });

  it('removes nothing at all if the delete fails partway', async () => {
    const before = await messageRepository.count(db);
    const failing = {
      ...db,
      withTransactionAsync: () => Promise.reject(new Error('disk full')),
    } as unknown as SqlDatabase;
    await app().initialize({ database: failing, now: () => NOW });

    await expect(app().remove(DEMO_RECORDS[0].transaction.id)).rejects.toThrow('disk full');

    await app().initialize({ database: db, now: () => NOW });
    expect(await messageRepository.count(db)).toBe(before);
    expect(record(DEMO_RECORDS[0].transaction.id)).toBeDefined();
  });
});

describe('editing a record from its detail screen', () => {
  it('saves a correction, confirms the record and clears its flags', async () => {
    const id = 'demo-t3';
    const built = buildRecordPatch(record(id), {
      text: { counterparty: 'CITY ATM', amount: '130,000' },
    });
    if (!built.ok) throw new Error(built.error);

    await app().correct(id, built.patch);

    expect(record(id)).toMatchObject({
      counterparty: 'CITY ATM',
      amount: 130000,
      status: 'CONFIRMED',
      confidence: 1,
      lowFields: [],
    });
  });

  it('records which fields changed, never their values', async () => {
    const built = buildRecordPatch(record('demo-t3'), { text: { counterparty: 'CITY ATM' } });
    if (!built.ok) throw new Error(built.error);
    await app().correct('demo-t3', built.patch);

    const events = await processingEventRepository.list(db);
    expect(events.find((e) => e.kind === 'TRANSACTION_CORRECTED')?.detail).toBe('counterparty');
    expect(JSON.stringify(events)).not.toContain('CITY ATM');
  });

  it('sends a confirmed record back to review when marked not correct', async () => {
    await app().markIncorrect('demo-t1');
    expect(record('demo-t1').status).toBe('NEEDS_REVIEW');
  });
});
