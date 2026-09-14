import type { SqlDatabase } from '../database/client';
import { transactionRepository } from '../database/repositories';
import { parseMessage } from '../features/parser';
import { duplicatePairs } from '../features/transactions/duplicates';
import { transactionFromParseResult, type Transaction } from '../features/transactions/model';
import { isDuplicateRecordError, useAppStore } from '../features/transactions/store';
import { messageKey, referenceKey, transactionKey } from '../features/transactions/transactionKey';
import { createMigratedDatabase } from './support/nodeSqlite';
import { saveNew } from './support/save';

const NOW = '2026-09-14T09:00:00.000Z';
const app = useAppStore.getState;

// Invented messages: no real names, numbers or references.
const WALLET = 'DEMO-WALLET-A';
const received = (ref: string) => `You have received TZS 12,345 from ALICE NDOSI. Ref: ${ref}.`;
const NO_REF = 'You have received TZS 7,000 from JANE DOE.';

describe('transaction IDs', () => {
  it('are the provider and the reference, ignoring case, spaces and punctuation', () => {
    expect(
      referenceKey({
        provider: 'Mixx by Yas',
        providerId: 'mixx',
        transactionReference: ' qh42-t8lm 9p ',
      }),
    ).toBe('ref:mixx:QH42T8LM9P');
  });

  it('fall back to the provider name, then to "unknown"', () => {
    const ref = 'QH42T8LM9P';
    expect(
      referenceKey({ provider: 'Mixx by Yas', providerId: null, transactionReference: ref }),
    ).toBe('ref:mixx-by-yas:QH42T8LM9P');
    expect(referenceKey({ provider: null, transactionReference: ref })).toBe(
      'ref:unknown:QH42T8LM9P',
    );
  });

  it('keep the same reference from two providers apart', () => {
    const ref = 'QH42T8LM9P';
    expect(
      referenceKey({ provider: null, providerId: 'mixx', transactionReference: ref }),
    ).not.toBe(referenceKey({ provider: null, providerId: 'bank', transactionReference: ref }));
  });

  it('use the message text, ignoring case and spacing, when there is no usable reference', () => {
    const key = transactionKey({ provider: 'x', transactionReference: null }, 'Hello  World\n');
    expect(key).toMatch(/^msg:[0-9a-f]{32}$/);
    expect(key).toBe(messageKey('hello world'));
    // Too short to be an ID.
    expect(transactionKey({ provider: 'x', transactionReference: 'AB1' }, 'hello world')).toBe(key);
    expect(transactionKey({ provider: null, transactionReference: null }, '   ')).toBeNull();
  });
});

let db: SqlDatabase;

beforeEach(async () => {
  db = await createMigratedDatabase();
  await app().initialize({ database: db, now: () => NOW });
});
afterEach(() => db.closeAsync());

describe('saving', () => {
  it('skips the same reference in other wording', async () => {
    const first = await saveNew(received('UNIQ99001'), WALLET);
    const second = await app().analyzeAndSave(
      'Umepokea TZS 12,345 kutoka ALICE NDOSI. Muamala: UNIQ99001.',
      WALLET,
    );
    expect(second).toMatchObject({ saved: false, duplicateOf: { id: first.id } });
  });

  it('skips a message with no reference pasted again with different spacing', async () => {
    const first = await saveNew(NO_REF, WALLET);
    const second = await app().analyzeAndSave(`  ${NO_REF.replace(' from', '\nfrom')}  `, WALLET);
    expect(second).toMatchObject({ saved: false, duplicateOf: { id: first.id } });
  });

  it('saves a different reference as a new transaction', async () => {
    await saveNew(received('UNIQ99001'), WALLET);
    await expect(saveNew(received('UNIQ99002'), WALLET)).resolves.toBeDefined();
  });

  it('is backed by the database: a second real record with the same ID is refused', async () => {
    const t = await saveNew(received('UNIQ99001'), WALLET);
    await expect(transactionRepository.insert(db, { ...t, id: 'copy' })).rejects.toThrow(/UNIQUE/);
    // Demo samples never block a real record, nor are blocked.
    await expect(
      transactionRepository.insert(db, { ...t, id: 'demo-copy', isDemo: true }),
    ).resolves.toBeDefined();
  });
});

describe('editing a record', () => {
  it('refuses a reference another record already has, and changes nothing', async () => {
    const a = await saveNew(received('UNIQ99001'), WALLET);
    const b = await saveNew(received('UNIQ99002'), WALLET);

    const error = await app()
      .correct(b.id, { transactionReference: 'UNIQ99001' })
      .catch((e: unknown) => e);
    expect(isDuplicateRecordError(error)).toBe(true);
    expect(isDuplicateRecordError(error) && error.existing.id).toBe(a.id);

    const stored = await transactionRepository.findById(db, b.id);
    expect(stored?.transactionReference).toBe('UNIQ99002');
    expect(stored?.status).toBe(b.status);
  });

  it('gives a record a new ID when its reference is corrected', async () => {
    const b = await saveNew(received('UNIQ99002'), WALLET);
    await app().correct(b.id, { transactionReference: 'UNIQ99003' });

    expect((await transactionRepository.findById(db, b.id))?.transactionKey).toMatch(/:UNIQ99003$/);
    // So the message it now matches is the one skipped.
    await expect(app().analyzeAndSave(received('UNIQ99003'), WALLET)).resolves.toMatchObject({
      saved: false,
      duplicateOf: { id: b.id },
    });
  });

  it('leaves the ID alone when other fields change', async () => {
    const b = await saveNew(received('UNIQ99002'), WALLET);
    await app().correct(b.id, { counterparty: 'ALICE N.' });
    expect((await transactionRepository.findById(db, b.id))?.transactionKey).toBe(b.transactionKey);
  });
});

describe('copies saved before duplicates were skipped', () => {
  const record = (id: string, createdAt: string, over: Partial<Transaction> = {}): Transaction => ({
    ...transactionFromParseResult(parseMessage(received('UNIQ99001'), { sender: WALLET }), {
      id,
      now: createdAt,
      sourceMessageId: null,
      parseResultId: null,
    }),
    ...over,
  });
  const copy = (id: string, createdAt: string) =>
    record(id, createdAt, { transactionKey: null, duplicateOf: 'orig' });

  beforeEach(async () => {
    await transactionRepository.insert(db, record('orig', '2026-09-01T08:00:00.000Z'));
    await transactionRepository.insert(db, copy('copy1', '2026-09-02T08:00:00.000Z'));
    await transactionRepository.insert(db, copy('copy2', '2026-09-03T08:00:00.000Z'));
    await app().refresh();
  });

  const pairs = () => duplicatePairs(app().transactions).map((p) => [p.original.id, p.copy.id]);

  it('are paired with the record they repeat', () => {
    expect(pairs()).toEqual([
      ['orig', 'copy1'],
      ['orig', 'copy2'],
    ]);
  });

  it('keep both: the copy is no longer paired, and takes no ID', async () => {
    await app().keepBoth('copy1');
    expect(pairs()).toEqual([['orig', 'copy2']]);
    expect(await transactionRepository.findById(db, 'copy1')).toMatchObject({
      duplicateOf: null,
      transactionKey: null,
    });
  });

  it('deleting a copy leaves the original as it was', async () => {
    const before = await transactionRepository.findById(db, 'orig');
    await app().remove('copy1');
    expect(pairs()).toEqual([['orig', 'copy2']]);
    expect((await transactionRepository.findById(db, 'orig'))?.transactionKey).toBe(
      before?.transactionKey,
    );
  });

  it('deleting the original hands its ID to the oldest copy', async () => {
    const key = (await transactionRepository.findById(db, 'orig'))?.transactionKey;
    await app().remove('orig');

    expect(await transactionRepository.findById(db, 'copy1')).toMatchObject({
      transactionKey: key,
      duplicateOf: null,
    });
    expect(pairs()).toEqual([['copy1', 'copy2']]);
    await expect(app().analyzeAndSave(received('UNIQ99001'), WALLET)).resolves.toMatchObject({
      saved: false,
      duplicateOf: { id: 'copy1' },
    });
  });
});
