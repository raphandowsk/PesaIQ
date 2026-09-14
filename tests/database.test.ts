import type { SqlDatabase } from '../database/client';
import { LATEST_VERSION, migrate } from '../database/migrations';
import {
  messageRepository,
  parseResultRepository,
  processingEventRepository,
  providerRepository,
  settingsRepository,
  transactionRepository,
  DEFAULT_SETTINGS,
} from '../database/repositories';
import { removeDemoData, seedDatabase } from '../database/seed';
import { parseMessage, SAMPLES } from '../features/parser';
import { DEMO_RECORDS } from '../features/transactions/demoData';
import { EMPTY_DETAILS } from '../features/parser/schema';
import { transactionFromParseResult, type Transaction } from '../features/transactions/model';
import { createMigratedDatabase, createTestDatabase } from './support/nodeSqlite';

const NOW = '2026-09-11T12:00:00.000Z';

const draft = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't-1',
  type: 'RECEIVED',
  status: 'PARSED',
  provider: 'Demo Bank',
  providerId: 'bank',
  amount: 50000,
  currency: 'TZS',
  counterparty: 'JOHN M.',
  maskedAccountOrPhone: '07** *** 678',
  transactionReference: 'ABC123',
  balanceAfter: 100000,
  transactionDate: '12 Mar 2026',
  transactionTime: '10:00',
  moneyCategory: 'RECEIVED_FROM_PEOPLE',
  fee: null,
  taxes: [],
  details: EMPTY_DETAILS,
  confidence: 0.9,
  lowFields: [],
  sourceMessageId: null,
  parseResultId: null,
  isDemo: false,
  transactionKey: null,
  duplicateOf: null,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

describe('migrations', () => {
  it('creates every table the app needs', async () => {
    const db = await createMigratedDatabase();
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    );
    expect(rows.map((r) => r.name).sort()).toEqual([
      'category_rules',
      'messages',
      'parse_results',
      'processing_events',
      'providers',
      'settings',
      'transactions',
    ]);
    await db.closeAsync();
  });

  it('records the schema version', async () => {
    const db = await createMigratedDatabase();
    const v = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    expect(v?.user_version).toBe(LATEST_VERSION);
    await db.closeAsync();
  });

  it('is safe to run twice', async () => {
    const db = createTestDatabase();
    await migrate(db);
    await expect(migrate(db)).resolves.toBe(LATEST_VERSION);
    await db.closeAsync();
  });
});

describe('transactionRepository', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = await createMigratedDatabase();
  });
  afterEach(() => db.closeAsync());

  it('round-trips a record without losing a field', async () => {
    const t = draft({ lowFields: ['amount', 'counterparty'] });
    await transactionRepository.insert(db, t);
    expect(await transactionRepository.findById(db, t.id)).toEqual(t);
  });

  it('returns null for an unknown id', async () => {
    expect(await transactionRepository.findById(db, 'nope')).toBeNull();
  });

  it('lists newest first', async () => {
    await transactionRepository.insert(db, draft({ id: 'a', createdAt: '2026-01-01T00:00:00Z' }));
    await transactionRepository.insert(db, draft({ id: 'b', createdAt: '2026-03-01T00:00:00Z' }));
    await transactionRepository.insert(db, draft({ id: 'c', createdAt: '2026-02-01T00:00:00Z' }));

    expect((await transactionRepository.list(db)).map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters by status', async () => {
    await transactionRepository.insert(db, draft({ id: 'a', status: 'CONFIRMED' }));
    await transactionRepository.insert(db, draft({ id: 'b', status: 'NEEDS_REVIEW' }));

    const review = await transactionRepository.list(db, { status: 'NEEDS_REVIEW' });
    expect(review.map((t) => t.id)).toEqual(['b']);
  });

  it('filters by a set of types', async () => {
    await transactionRepository.insert(db, draft({ id: 'a', type: 'RECEIVED' }));
    await transactionRepository.insert(db, draft({ id: 'b', type: 'WITHDRAWAL' }));
    await transactionRepository.insert(db, draft({ id: 'c', type: 'AIRTIME' }));

    const out = await transactionRepository.list(db, { types: ['WITHDRAWAL', 'AIRTIME'] });
    expect(out.map((t) => t.id).sort()).toEqual(['b', 'c']);
  });

  it('searches counterparty, reference, provider and masked identifier', async () => {
    await transactionRepository.insert(
      db,
      draft({ id: 'a', counterparty: 'GRACE KIMARO', transactionReference: 'ZZZ999' }),
    );
    await transactionRepository.insert(
      db,
      draft({ id: 'b', counterparty: 'JOHN M.', transactionReference: 'QH42T8' }),
    );

    expect((await transactionRepository.list(db, { search: 'grace' })).map((t) => t.id)).toEqual([
      'a',
    ]);
    expect((await transactionRepository.list(db, { search: 'QH42' })).map((t) => t.id)).toEqual([
      'b',
    ]);
    expect((await transactionRepository.list(db, { search: '*** 678' })).length).toBe(2);
  });

  it('survives a search containing SQL punctuation', async () => {
    await transactionRepository.insert(db, draft({ id: 'a' }));
    await expect(
      transactionRepository.list(db, { search: "'; DROP TABLE transactions; --" }),
    ).resolves.toEqual([]);
    // The table is still there.
    expect(await transactionRepository.findById(db, 'a')).not.toBeNull();
  });

  it('excludes demo records when asked', async () => {
    await transactionRepository.insert(db, draft({ id: 'real', isDemo: false }));
    await transactionRepository.insert(db, draft({ id: 'demo', isDemo: true }));

    const real = await transactionRepository.list(db, { includeDemo: false });
    expect(real.map((t) => t.id)).toEqual(['real']);
  });

  it('applies a limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await transactionRepository.insert(db, draft({ id: `t${i}` }));
    }
    expect((await transactionRepository.list(db, { limit: 2 })).length).toBe(2);
  });

  it('updates only the fields given and stamps updatedAt', async () => {
    await transactionRepository.insert(db, draft());
    const later = '2026-09-12T08:00:00.000Z';

    const updated = await transactionRepository.update(
      db,
      't-1',
      { status: 'CONFIRMED', amount: 75000 },
      later,
    );

    expect(updated?.status).toBe('CONFIRMED');
    expect(updated?.amount).toBe(75000);
    expect(updated?.counterparty).toBe('JOHN M.');
    expect(updated?.updatedAt).toBe(later);
    expect(updated?.createdAt).toBe(NOW);

    expect(await transactionRepository.findById(db, 't-1')).toEqual(updated);
  });

  it('returns null when updating something that does not exist', async () => {
    expect(
      await transactionRepository.update(db, 'ghost', { status: 'CONFIRMED' }, NOW),
    ).toBeNull();
  });

  it('deletes a record', async () => {
    await transactionRepository.insert(db, draft());
    expect(await transactionRepository.remove(db, 't-1')).toBe(true);
    expect(await transactionRepository.findById(db, 't-1')).toBeNull();
    expect(await transactionRepository.remove(db, 't-1')).toBe(false);
  });

  it('removes demo records but keeps real ones', async () => {
    await transactionRepository.insert(db, draft({ id: 'real', isDemo: false }));
    await transactionRepository.insert(db, draft({ id: 'demo', isDemo: true }));

    expect(await transactionRepository.removeDemo(db)).toBe(1);
    expect((await transactionRepository.list(db)).map((t) => t.id)).toEqual(['real']);
  });

  it('counts by status', async () => {
    await transactionRepository.insert(db, draft({ id: 'a', status: 'NEEDS_REVIEW' }));
    await transactionRepository.insert(db, draft({ id: 'b', status: 'NEEDS_REVIEW' }));
    await transactionRepository.insert(db, draft({ id: 'c', status: 'CONFIRMED' }));

    expect(await transactionRepository.countByStatus(db, 'NEEDS_REVIEW')).toBe(2);
  });

  it('finds the real record with a transaction ID', async () => {
    const key = 'ref:bank:QH42T8LM9P';
    await transactionRepository.insert(db, draft({ id: 'a', transactionKey: key }));
    await transactionRepository.insert(
      db,
      draft({ id: 'demo', transactionKey: 'ref:bank:DEMO0001', isDemo: true }),
    );

    expect((await transactionRepository.findByKey(db, key))?.id).toBe('a');
    // Leaving out the record being edited.
    expect(await transactionRepository.findByKey(db, key, 'a')).toBeNull();
    expect(await transactionRepository.findByKey(db, 'ref:bank:OTHER0001')).toBeNull();
    // Demo samples never count, and no ID never matches.
    expect(await transactionRepository.findByKey(db, 'ref:bank:DEMO0001')).toBeNull();
    expect(await transactionRepository.findByKey(db, '')).toBeNull();
  });

  it('lets any number of records have no transaction ID', async () => {
    await transactionRepository.insert(db, draft({ id: 'a', transactionKey: null }));
    await expect(
      transactionRepository.insert(db, draft({ id: 'b', transactionKey: null })),
    ).resolves.toBeDefined();
  });
});

describe('messageRepository', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = await createMigratedDatabase();
  });
  afterEach(() => db.closeAsync());

  it('round-trips a message', async () => {
    const m = {
      id: 'm1',
      originalText: '  raw  text ',
      normalizedText: 'raw text',
      sender: 'DEMO-BANK',
      receivedAt: NOW,
      source: 'MANUAL' as const,
      isDemo: false,
      createdAt: NOW,
    };
    await messageRepository.insert(db, m);
    expect(await messageRepository.findById(db, 'm1')).toEqual(m);
  });

  it('deletes every message, so the privacy promise can be kept', async () => {
    for (let i = 0; i < 3; i += 1) {
      await messageRepository.insert(db, {
        id: `m${i}`,
        originalText: 'x',
        normalizedText: 'x',
        sender: null,
        receivedAt: NOW,
        source: 'MANUAL',
        isDemo: false,
        createdAt: NOW,
      });
    }
    expect(await messageRepository.removeAll(db)).toBe(3);
    expect(await messageRepository.count(db)).toBe(0);
  });
});

describe('parseResultRepository', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = await createMigratedDatabase();
    await messageRepository.insert(db, {
      id: 'm1',
      originalText: SAMPLES[0].text,
      normalizedText: SAMPLES[0].text.trim(),
      sender: SAMPLES[0].sender,
      receivedAt: NOW,
      source: 'MANUAL',
      isDemo: false,
      createdAt: NOW,
    });
  });
  afterEach(() => db.closeAsync());

  it('stores a parse result and reads it back intact', async () => {
    const result = parseMessage(SAMPLES[0].text, { sender: SAMPLES[0].sender });
    await parseResultRepository.insert(db, {
      id: 'p1',
      messageId: 'm1',
      result,
      createdAt: NOW,
    });

    const stored = await parseResultRepository.findById(db, 'p1');
    expect(stored?.result).toEqual(result);
    expect(stored?.category).toBe('PAYMENT_RECEIVED');
  });

  it('ignores a corrupt payload rather than throwing', async () => {
    await db.runAsync(
      `INSERT INTO parse_results
         (id, message_id, parser_id, category, type, confidence, band, payload, created_at)
       VALUES ('bad', 'm1', 'x', 'OTHER', 'UNKNOWN', 0.5, 'Medium', '{not json', ?)`,
      [NOW],
    );
    expect(await parseResultRepository.findById(db, 'bad')).toBeNull();
    expect(await parseResultRepository.findByMessageId(db, 'm1')).toEqual([]);
  });

  it('cascades when its message is deleted', async () => {
    const result = parseMessage(SAMPLES[0].text);
    await parseResultRepository.insert(db, { id: 'p1', messageId: 'm1', result, createdAt: NOW });

    await messageRepository.remove(db, 'm1');
    expect(await parseResultRepository.findById(db, 'p1')).toBeNull();
  });
});

describe('settingsRepository', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = await createMigratedDatabase();
  });
  afterEach(() => db.closeAsync());

  it('defaults every privacy-sensitive toggle to off', async () => {
    const s = await settingsRepository.getAll(db);
    expect(s.aiFallback).toBe(false);
    expect(s.cloudSync).toBe(false);
    expect(s.automaticProcessing).toBe(false);
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it('persists a change and reads it back', async () => {
    await settingsRepository.set(db, 'aiFallback', true, NOW);
    expect(await settingsRepository.get(db, 'aiFallback')).toBe(true);
    expect((await settingsRepository.getAll(db)).aiFallback).toBe(true);
  });

  it('upserts rather than duplicating a key', async () => {
    await settingsRepository.set(db, 'cloudSync', true, NOW);
    await settingsRepository.set(db, 'cloudSync', false, NOW);

    const rows = await db.getAllAsync('SELECT * FROM settings WHERE key = ?', ['cloudSync']);
    expect(rows.length).toBe(1);
    expect(await settingsRepository.get(db, 'cloudSync')).toBe(false);
  });

  it('falls back to the default for a key never written', async () => {
    expect(await settingsRepository.get(db, 'onboardingComplete')).toBe(false);
  });
});

describe('providerRepository', () => {
  it('seeds Mixx as experimental and every other provider as a demo', async () => {
    const db = await createMigratedDatabase();
    await providerRepository.seed(db);

    const providers = await providerRepository.list(db);
    expect(providers.length).toBeGreaterThanOrEqual(10);
    // Nothing may claim support until fixtures prove it. Mixx has fixtures from
    // real layouts, so it is experimental; none is "supported".
    expect(providers.find((p) => p.id === 'mixx')?.maturity).toBe('EXPERIMENTAL');
    expect(providers.filter((p) => p.id !== 'mixx').every((p) => p.maturity === 'DEMO')).toBe(true);
    await db.closeAsync();
  });

  it('is idempotent', async () => {
    const db = await createMigratedDatabase();
    await providerRepository.seed(db);
    const first = (await providerRepository.list(db)).length;
    await providerRepository.seed(db);
    expect((await providerRepository.list(db)).length).toBe(first);
    await db.closeAsync();
  });
});

describe('processingEventRepository', () => {
  it('records events without any message content', async () => {
    const db = await createMigratedDatabase();
    await processingEventRepository.record(db, {
      id: 'e1',
      kind: 'TRANSACTION_SAVED',
      messageId: 'm1',
      transactionId: 't1',
      detail: 'confidence 0.96',
      createdAt: NOW,
    });

    const events = await processingEventRepository.list(db);
    expect(events[0].kind).toBe('TRANSACTION_SAVED');
    expect(JSON.stringify(events)).not.toContain('TZS');
    await db.closeAsync();
  });
});

describe('seeding', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = await createMigratedDatabase();
  });
  afterEach(() => db.closeAsync());

  it('inserts the demo records and their source messages', async () => {
    const result = await seedDatabase(db, NOW);
    expect(result.demoRecordsInserted).toBe(DEMO_RECORDS.length);
    expect((await transactionRepository.list(db)).length).toBe(DEMO_RECORDS.length);
    expect(await messageRepository.count(db)).toBe(DEMO_RECORDS.length);
  });

  it('does not duplicate on a second run', async () => {
    await seedDatabase(db, NOW);
    const second = await seedDatabase(db, NOW);
    expect(second.demoRecordsInserted).toBe(0);
    expect((await transactionRepository.list(db)).length).toBe(DEMO_RECORDS.length);
  });

  it('marks every seeded record as demo', async () => {
    await seedDatabase(db, NOW);
    expect((await transactionRepository.list(db)).every((t) => t.isDemo)).toBe(true);
  });

  it('removes demo transactions and their messages together', async () => {
    await seedDatabase(db, NOW);
    const removed = await removeDemoData(db, NOW);

    expect(removed).toBe(DEMO_RECORDS.length);
    expect(await transactionRepository.list(db)).toEqual([]);
    // The source text must go too - it is the sensitive part.
    expect(await messageRepository.count(db)).toBe(0);
  });

  it('keeps user records when demo data is removed', async () => {
    await seedDatabase(db, NOW);
    await transactionRepository.insert(db, draft({ id: 'mine', isDemo: false }));

    await removeDemoData(db, NOW);
    expect((await transactionRepository.list(db)).map((t) => t.id)).toEqual(['mine']);
  });

  it('does not re-seed after the user removed demo data', async () => {
    await seedDatabase(db, NOW);
    await removeDemoData(db, NOW);

    const again = await seedDatabase(db, NOW);
    expect(again.demoRecordsInserted).toBe(0);
    expect(await transactionRepository.list(db)).toEqual([]);
  });
});

describe('parse -> save', () => {
  let db: SqlDatabase;
  beforeEach(async () => {
    db = await createMigratedDatabase();
  });
  afterEach(() => db.closeAsync());

  it('saves a confident parse as PARSED', async () => {
    const result = parseMessage(SAMPLES[0].text, { sender: SAMPLES[0].sender });
    const t = transactionFromParseResult(result, { id: 't1', now: NOW });

    expect(t.status).toBe('PARSED');
    await transactionRepository.insert(db, t);
    expect((await transactionRepository.findById(db, 't1'))?.amount).toBe(250000);
  });

  it('sends a promotional message to the review queue', async () => {
    const result = parseMessage(SAMPLES[3].text, { sender: SAMPLES[3].sender });
    const t = transactionFromParseResult(result, { id: 't2', now: NOW });

    expect(t.status).toBe('NEEDS_REVIEW');
    expect(t.amount).toBeNull();
  });

  it('sends anything without an amount to review, however confident', async () => {
    const result = parseMessage('You have received a payment from JOHN DOE. Ref: ABC123456');
    const t = transactionFromParseResult(result, { id: 't3', now: NOW });
    expect(t.status).toBe('NEEDS_REVIEW');
  });

  it('carries low-confidence field keys through for the review queue', async () => {
    const result = parseMessage(SAMPLES[2].text, { sender: SAMPLES[2].sender });
    const t = transactionFromParseResult(result, { id: 't4', now: NOW });
    expect(t.lowFields).toContain('counterparty');
  });

  it('never stores an unmasked identifier', async () => {
    const result = parseMessage(SAMPLES[0].text, { sender: SAMPLES[0].sender });
    const t = transactionFromParseResult(result, { id: 't5', now: NOW });
    await transactionRepository.insert(db, t);

    const stored = await transactionRepository.findById(db, 't5');
    expect(JSON.stringify(stored)).not.toContain('0712345678');
    expect(stored?.maskedAccountOrPhone).toBe('07** *** 678');
  });
});
