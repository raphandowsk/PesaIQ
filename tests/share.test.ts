/**
 * Messages shared to PesaIQ from another app: held until the app can read
 * them, then read exactly like a pasted message.
 */
import type { SqlDatabase } from '../database/client';
import { useLabStore } from '../features/lab/store';
import { SAMPLES } from '../features/parser';
import { SHARE_AVAILABLE } from '../features/share/availability';
import { openSharedMessage, type SharedDestination } from '../features/share/open';
import { sharedMessageText, useShareStore } from '../features/share/store';
import { useAppStore } from '../features/transactions/store';
import { TZ } from './fixtures/tz-messages';
import { createMigratedDatabase } from './support/nodeSqlite';

describe('a shared message', () => {
  beforeEach(() => useShareStore.setState({ pending: null }));

  it('is trimmed, and nothing is nothing', () => {
    expect(sharedMessageText(`  ${TZ.mixxBetting}\r\n`)).toBe(TZ.mixxBetting);
    expect(sharedMessageText('   \n ')).toBeNull();
    expect(sharedMessageText(null)).toBeNull();
  });

  it('waits until it is taken, once', () => {
    useShareStore.getState().receive(TZ.mixxBetting);
    expect(useShareStore.getState().take()).toBe(TZ.mixxBetting);
    expect(useShareStore.getState().take()).toBeNull();
  });

  it('gives way to a newer share, and ignores an empty one', () => {
    useShareStore.getState().receive(TZ.mixxBetting);
    useShareStore.getState().receive(TZ.mixxToPerson);
    useShareStore.getState().receive('  ');
    expect(useShareStore.getState().pending).toBe(TZ.mixxToPerson);
  });

  it('is off outside an installed Android build, such as Expo Go or the web', () => {
    expect(SHARE_AVAILABLE).toBe(false);
  });
});

describe('opening a shared message', () => {
  let db: SqlDatabase;
  let went: SharedDestination[];
  const go = (to: SharedDestination) => went.push(to);

  beforeEach(async () => {
    db = await createMigratedDatabase();
    went = [];
    useLabStore.getState().discard();
    await useAppStore
      .getState()
      .initialize({ database: db, now: () => '2026-09-15T08:00:00.000Z' });
  });
  afterEach(() => db.closeAsync());

  it('reads it like a pasted message and shows the result', async () => {
    await openSharedMessage(TZ.mixxLipaMerchant, go);
    expect(went).toEqual(['/result']);
    expect(useLabStore.getState().draft).toMatchObject({
      provider: 'Mixx by Yas',
      amount: 5000,
      transactionReference: '26700000000001',
    });
  });

  it('saves nothing until the person does', async () => {
    const before = useAppStore.getState().transactions.length;
    await openSharedMessage(TZ.mixxLipaMerchant, go);
    expect(useAppStore.getState().transactions).toHaveLength(before);
  });

  it('replaces what was in the Lab, including a sample’s sender', async () => {
    useLabStore.getState().loadSample(SAMPLES[0]);
    await openSharedMessage(TZ.mixxBetting, go);
    expect(useLabStore.getState().draft?.sender).toBeUndefined();
    expect(useLabStore.getState().draft?.amount).toBe(32000);
  });

  it('opens the Lab, with the reason, when it cannot be read', async () => {
    await openSharedMessage('x'.repeat(2000), go);
    expect(went).toEqual(['/parser-lab']);
    expect(useLabStore.getState().error).toMatch(/unusually long/);
    expect(useLabStore.getState().text).toHaveLength(2000);
  });
});
