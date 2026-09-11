import type { SqlDatabase } from '../database/client';
import { SAMPLES } from '../features/parser';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

const NOW = '2026-09-11T12:00:00.000Z';
const app = () => useAppStore.getState();

let db: SqlDatabase;
let n = 0;

beforeEach(async () => {
  db = await createMigratedDatabase();
  n = 0;
  await app().initialize({
    database: db,
    now: () => NOW,
    makeId: (prefix) => `${prefix}-${++n}`,
  });
});
afterEach(() => db.closeAsync());

describe('activity for the streak', () => {
  it('starts empty: seeding demo data is not the user doing anything', () => {
    expect(app().activity).toEqual([]);
  });

  it('picks up a save', async () => {
    await app().analyzeAndSave(SAMPLES[1].text, SAMPLES[1].sender);
    expect(app().activity).toEqual([NOW]);
  });

  it('picks up a review action', async () => {
    const reviewId = DEMO_RECORDS.find((r) => r.transaction.status === 'NEEDS_REVIEW')!.transaction
      .id;
    await app().confirm(reviewId);
    expect(app().activity).toHaveLength(1);
  });

  it('does not count a deletion as activity', async () => {
    await app().remove(DEMO_RECORDS[0].transaction.id);
    expect(app().activity).toEqual([]);
  });

  it('survives a restart', async () => {
    await app().analyzeAndSave(SAMPLES[1].text, SAMPLES[1].sender);
    await app().initialize({ database: db, now: () => NOW });
    expect(app().activity).toEqual([NOW]);
  });

  it('is cleared along with processing history', async () => {
    await app().analyzeAndSave(SAMPLES[1].text, SAMPLES[1].sender);
    await app().clearProcessingHistory();
    expect(app().activity).toEqual([]);
  });
});
