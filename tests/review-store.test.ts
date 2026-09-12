import type { SqlDatabase } from '../database/client';
import { processingEventRepository } from '../database/repositories';
import { SAMPLES } from '../features/parser';
import { reviewQueue } from '../features/review/queue';
import { summarize } from '../features/transactions/selectors';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

const NOW = '2026-09-11T12:00:00.000Z';
const app = () => useAppStore.getState();

let db: SqlDatabase;
let n = 0;

beforeEach(async () => {
  db = await createMigratedDatabase();
  n = 0;
  await app().initialize({ database: db, now: () => NOW, makeId: (p) => `${p}-${++n}` });
});
afterEach(() => db.closeAsync());

describe('review activity in the store', () => {
  it('starts with nothing cleared', () => {
    expect(app().reviewedAt).toEqual([]);
  });

  it('counts a confirm, a correction and an ignore', async () => {
    await app().confirm('demo-t3');
    await app().correct('demo-t4', { counterparty: 'VODA' });
    await app().ignore('demo-t2');
    expect(app().reviewedAt).toEqual([NOW, NOW, NOW]);
  });

  it('does not count saving a new record as clearing one', async () => {
    await app().analyzeAndSave(SAMPLES[1].text, SAMPLES[1].sender);
    expect(app().reviewedAt).toEqual([]);
    expect(app().activity).toHaveLength(1);
  });

  it('logs an ignore, with no content, and counts it toward the streak', async () => {
    await app().ignore('demo-t3');

    const events = await processingEventRepository.list(db);
    const ignored = events.find((e) => e.kind === 'TRANSACTION_IGNORED');
    expect(ignored).toMatchObject({ transactionId: 'demo-t3', detail: null, messageId: null });
    expect(app().activity).toHaveLength(1);
  });

  it('takes an ignored record out of the queue and the totals, not out of Records', async () => {
    const sentBefore = summarize(app().transactions).sent;
    await app().ignore('demo-t3');

    expect(reviewQueue(app().transactions).map((t) => t.id)).toEqual(['demo-t4']);
    expect(summarize(app().transactions).sent).toBe(sentBefore - 120000);
    expect(app().transactions.find((t) => t.id === 'demo-t3')?.status).toBe('IGNORED');
  });

  it('survives a restart', async () => {
    await app().confirm('demo-t3');
    await app().initialize({ database: db, now: () => NOW });
    expect(app().reviewedAt).toEqual([NOW]);
  });

  it('is cleared along with processing history', async () => {
    await app().confirm('demo-t3');
    await app().clearProcessingHistory();
    expect(app().reviewedAt).toEqual([]);
    expect(app().activity).toEqual([]);
  });
});
