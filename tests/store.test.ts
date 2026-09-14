import type { SqlDatabase } from '../database/client';
import { messageRepository, processingEventRepository } from '../database/repositories';
import { SAMPLES } from '../features/parser';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import { useAppStore } from '../features/transactions/store';
import { ManualSmsSource } from '../services/sms';
import { createMigratedDatabase } from './support/nodeSqlite';
import { saveNew } from './support/save';

const NOW = '2026-09-11T12:00:00.000Z';

let db: SqlDatabase;
let idCounter = 0;

const initStore = async () => {
  db = await createMigratedDatabase();
  idCounter = 0;
  await useAppStore.getState().initialize({
    database: db,
    now: () => NOW,
    makeId: (prefix) => {
      idCounter += 1;
      return `${prefix}-${idCounter}`;
    },
  });
};

describe('store initialization', () => {
  beforeEach(initStore);
  afterEach(() => db.closeAsync());

  it('becomes ready and loads the demo records', () => {
    const s = useAppStore.getState();
    expect(s.ready).toBe(true);
    expect(s.error).toBeNull();
    expect(s.transactions.length).toBe(DEMO_RECORDS.length);
  });

  it('starts with the privacy-sensitive settings off', () => {
    const { settings } = useAppStore.getState();
    expect(settings.aiFallback).toBe(false);
    expect(settings.cloudSync).toBe(false);
    expect(settings.automaticProcessing).toBe(false);
  });

  it('starts the manual sms source', () => {
    expect(useAppStore.getState().smsSource.isRunning).toBe(true);
  });

  it('reports an error instead of throwing when the database fails', async () => {
    const broken = {
      ...(await createMigratedDatabase()),
      getAllAsync: () => Promise.reject(new Error('disk gone')),
    } as unknown as SqlDatabase;

    await useAppStore.getState().initialize({ database: broken, now: () => NOW });

    const s = useAppStore.getState();
    expect(s.ready).toBe(false);
    expect(s.error).toBe('disk gone');
  });
});

describe('analyzeAndSave', () => {
  beforeEach(initStore);
  afterEach(() => db.closeAsync());

  it('saves a parsed transaction and shows it in the list', async () => {
    const before = useAppStore.getState().transactions.length;
    const transaction = await saveNew(SAMPLES[0].text, SAMPLES[0].sender);

    expect(transaction.amount).toBe(250000);
    expect(transaction.status).toBe('PARSED');
    expect(useAppStore.getState().transactions.length).toBe(before + 1);
  });

  it('stores the source message and the parse result alongside', async () => {
    const transaction = await saveNew(SAMPLES[0].text, SAMPLES[0].sender);

    expect(transaction.sourceMessageId).toBeTruthy();
    const message = await messageRepository.findById(db, transaction.sourceMessageId!);
    expect(message?.originalText).toBe(SAMPLES[0].text);
  });

  it('skips a transaction that is already saved, and notes the attempt', async () => {
    const first = await saveNew(SAMPLES[0].text, SAMPLES[0].sender);
    const messagesBefore = await messageRepository.count(db);

    const second = await useAppStore.getState().analyzeAndSave(SAMPLES[0].text, SAMPLES[0].sender);
    expect(second).toMatchObject({ saved: false, duplicateOf: { id: first.id } });

    // Nothing new is stored: no record, and no second copy of the message.
    expect(useAppStore.getState().transactions.filter((t) => !t.isDemo)).toHaveLength(1);
    expect(await messageRepository.count(db)).toBe(messagesBefore);

    const events = await processingEventRepository.list(db);
    expect(events.find((e) => e.kind === 'DUPLICATE_DETECTED')).toMatchObject({
      transactionId: first.id,
      messageId: null,
    });
  });

  it('never lets a demo sample block a real record', async () => {
    // The demo seed already carries QH42T8LM9P, the sample's reference.
    const saved = await useAppStore.getState().analyzeAndSave(SAMPLES[0].text, SAMPLES[0].sender);
    expect(saved.saved).toBe(true);
  });

  it('records an event carrying confidence but no message content', async () => {
    const unique = 'You have received TZS 12,345 from ALICE NDOSI 0713334444. Ref: UNIQ99001.';
    await useAppStore.getState().analyzeAndSave(unique, 'DEMO-WALLET-A');

    const events = await processingEventRepository.list(db);
    expect(events[0].kind).toBe('TRANSACTION_SAVED');
    expect(events[0].detail).toMatch(/confidence/);

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain('ALICE');
    expect(serialized).not.toContain('0713334444');
    expect(serialized).not.toContain('12,345');
  });

  it('sends a promotional message straight to review', async () => {
    const transaction = await saveNew(SAMPLES[3].text, SAMPLES[3].sender);
    expect(transaction.status).toBe('NEEDS_REVIEW');
  });

  it('rolls back completely if saving fails partway', async () => {
    const before = useAppStore.getState().transactions.length;
    const messageCountBefore = await messageRepository.count(db);

    const failing = {
      ...db,
      withTransactionAsync: () => Promise.reject(new Error('write failed')),
    } as unknown as SqlDatabase;
    await useAppStore.getState().initialize({ database: failing, now: () => NOW });

    await expect(
      useAppStore.getState().analyzeAndSave(SAMPLES[0].text, SAMPLES[0].sender),
    ).rejects.toThrow('write failed');

    // Re-point at the real database and confirm nothing landed.
    await useAppStore.getState().initialize({ database: db, now: () => NOW });
    expect(useAppStore.getState().transactions.length).toBe(before);
    expect(await messageRepository.count(db)).toBe(messageCountBefore);
  });

  it('propagates a parse error rather than saving a broken record', async () => {
    expect(() => useAppStore.getState().analyze('')).toThrow();
    await expect(useAppStore.getState().analyzeAndSave('')).rejects.toThrow();
  });
});

describe('review actions', () => {
  beforeEach(initStore);
  afterEach(() => db.closeAsync());

  const reviewId = DEMO_RECORDS.find((r) => r.transaction.status === 'NEEDS_REVIEW')!.transaction
    .id;

  it('confirms a record and clears its low-confidence flags', async () => {
    await useAppStore.getState().confirm(reviewId);

    const t = useAppStore.getState().transactions.find((x) => x.id === reviewId);
    expect(t?.status).toBe('CONFIRMED');
    expect(t?.lowFields).toEqual([]);
  });

  it('applies a correction, marks it confirmed and trusts it fully', async () => {
    await useAppStore.getState().correct(reviewId, { amount: 999, counterparty: 'FIXED NAME' });

    const t = useAppStore.getState().transactions.find((x) => x.id === reviewId);
    expect(t?.amount).toBe(999);
    expect(t?.counterparty).toBe('FIXED NAME');
    expect(t?.status).toBe('CONFIRMED');
    expect(t?.confidence).toBe(1);
  });

  it('records which fields a correction touched, not their values', async () => {
    await useAppStore.getState().correct(reviewId, { amount: 999 });

    const events = await processingEventRepository.list(db);
    const corrected = events.find((e) => e.kind === 'TRANSACTION_CORRECTED');
    expect(corrected?.detail).toBe('amount');
    expect(corrected?.detail).not.toContain('999');
  });

  it('sends a record back to review when marked incorrect', async () => {
    const confirmedId = DEMO_RECORDS.find((r) => r.transaction.status === 'CONFIRMED')!.transaction
      .id;
    await useAppStore.getState().markIncorrect(confirmedId);

    expect(useAppStore.getState().transactions.find((x) => x.id === confirmedId)?.status).toBe(
      'NEEDS_REVIEW',
    );
  });

  it('ignores a record without deleting it', async () => {
    await useAppStore.getState().ignore(reviewId);
    expect(useAppStore.getState().transactions.find((x) => x.id === reviewId)?.status).toBe(
      'IGNORED',
    );
  });

  it('deletes a record', async () => {
    const before = useAppStore.getState().transactions.length;
    await useAppStore.getState().remove(reviewId);

    expect(useAppStore.getState().transactions.length).toBe(before - 1);
    expect(useAppStore.getState().transactions.find((x) => x.id === reviewId)).toBeUndefined();
  });
});

describe('settings and data management', () => {
  beforeEach(initStore);
  afterEach(() => db.closeAsync());

  it('persists a setting change', async () => {
    await useAppStore.getState().setSetting('aiFallback', true);
    expect(useAppStore.getState().settings.aiFallback).toBe(true);
  });

  it('deletes every transaction', async () => {
    await useAppStore.getState().deleteAllTransactions();
    expect(useAppStore.getState().transactions).toEqual([]);
  });

  it('deletes every stored message', async () => {
    await useAppStore.getState().deleteAllMessages();
    expect(await messageRepository.count(db)).toBe(0);
  });

  it('clears processing history', async () => {
    await useAppStore.getState().analyzeAndSave(SAMPLES[0].text, SAMPLES[0].sender);
    await useAppStore.getState().clearProcessingHistory();
    expect(await processingEventRepository.list(db)).toEqual([]);
  });

  it('removes demo data but keeps what the user saved', async () => {
    await useAppStore.getState().analyzeAndSave(SAMPLES[0].text, SAMPLES[0].sender);
    await useAppStore.getState().clearDemoData();

    const remaining = useAppStore.getState().transactions;
    expect(remaining.length).toBe(1);
    expect(remaining[0].isDemo).toBe(false);
    expect(useAppStore.getState().settings.demoDataEnabled).toBe(false);
  });
});

describe('ManualSmsSource', () => {
  it('delivers a submitted message to subscribers', async () => {
    const source = new ManualSmsSource();
    await source.start();

    const seen: string[] = [];
    source.subscribe((m) => seen.push(m.text));
    source.submit({ text: 'hello', receivedAt: NOW });

    expect(seen).toEqual(['hello']);
  });

  it('refuses to deliver before start', () => {
    const source = new ManualSmsSource();
    expect(() => source.submit({ text: 'x', receivedAt: NOW })).toThrow(/before start/);
  });

  it('stops delivering after unsubscribe', async () => {
    const source = new ManualSmsSource();
    await source.start();

    const seen: string[] = [];
    const off = source.subscribe((m) => seen.push(m.text));
    off();
    source.submit({ text: 'ignored', receivedAt: NOW });

    expect(seen).toEqual([]);
  });

  it('keeps delivering to other subscribers when one throws', async () => {
    const source = new ManualSmsSource();
    await source.start();

    const seen: string[] = [];
    source.subscribe(() => {
      throw new Error('bad subscriber');
    });
    source.subscribe((m) => seen.push(m.text));

    expect(() => source.submit({ text: 'delivered', receivedAt: NOW })).not.toThrow();
    expect(seen).toEqual(['delivered']);
  });

  it('reports its running state', async () => {
    const source = new ManualSmsSource();
    expect(source.isRunning).toBe(false);
    await source.start();
    expect(source.isRunning).toBe(true);
    await source.stop();
    expect(source.isRunning).toBe(false);
  });
});
