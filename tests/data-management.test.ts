import type { SqlDatabase } from '../database/client';
import { SAMPLES } from '../features/parser';
import { useAppStore } from '../features/transactions/store';
import { createDatabaseWithSamples } from './support/nodeSqlite';

const NOW = '2026-09-12T08:00:00.000Z';
const app = () => useAppStore.getState();

let db: SqlDatabase;
let n = 0;

const rows = async (table: 'messages' | 'parse_results' | 'transactions') =>
  (await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;

beforeEach(async () => {
  db = await createDatabaseWithSamples();
  n = 0;
  await app().initialize({ database: db, now: () => NOW, makeId: (p) => `${p}-${++n}` });
  // Six demo records plus one of the user's.
  await app().analyzeAndSave(SAMPLES[0].text, SAMPLES[0].sender);
});
afterEach(() => db.closeAsync());

describe('Delete all transactions', () => {
  it('removes every record with its source message and parse, and says how many', async () => {
    expect(await app().deleteAllTransactions()).toBe(7);

    expect(app().transactions).toEqual([]);
    expect(await rows('transactions')).toBe(0);
    expect(await rows('messages')).toBe(0);
    expect(await rows('parse_results')).toBe(0);
  });

  it('turns demo data off, so the samples do not come back on the next launch', async () => {
    await app().deleteAllTransactions();
    expect(app().settings.demoDataEnabled).toBe(false);

    await app().initialize({ database: db, now: () => NOW });
    expect(app().transactions).toEqual([]);
  });
});

describe('Delete all messages', () => {
  it('removes the text and its parses but keeps every record', async () => {
    expect(await app().deleteAllMessages()).toBe(7);

    expect(app().transactions).toHaveLength(7);
    expect(await rows('parse_results')).toBe(0);
    // The in-memory records are reloaded, so nothing still points at a message.
    expect(app().transactions.every((t) => t.sourceMessageId === null)).toBe(true);
    expect(app().transactions.every((t) => t.parseResultId === null)).toBe(true);
    expect(await app().getRecordSource('demo-m1')).toBeNull();
  });
});

describe('Clear processing history', () => {
  it('says how many events went', async () => {
    expect(await app().clearProcessingHistory()).toBe(1);
    expect(app().activity).toEqual([]);
  });
});
