import type { SqlDatabase } from '../database/client';
import { processingEventRepository, transactionRepository } from '../database/repositories';
import { LAB_SAVE_ERRORS } from '../features/lab/draft';
import { LAB_ERRORS, useLabStore } from '../features/lab/store';
import { MAX_MESSAGE_LENGTH, SAMPLES } from '../features/parser';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

const NOW = '2026-09-11T12:00:00.000Z';
const lab = () => useLabStore.getState();

// Sample indexes, named for readability.
const RECEIVED = 0;
const BANK_ATM = 2;
const PROMO = 3;

let db: SqlDatabase;

beforeEach(async () => {
  db = await createMigratedDatabase();
  await useAppStore.getState().initialize({ database: db, now: () => NOW });
  lab().discard();
});
afterEach(() => db.closeAsync());

const analyzeSample = (i: number) => {
  lab().loadSample(SAMPLES[i]);
  expect(lab().analyze()).toBe(true);
};

const count = async () => (await transactionRepository.list(db)).length;

describe('analyzing in the Lab', () => {
  it('refuses an empty message', () => {
    lab().setText('   ');
    expect(lab().analyze()).toBe(false);
    expect(lab().error).toBe(LAB_ERRORS.empty);
    expect(lab().draft).toBeNull();
  });

  it('refuses an over-long message, and says where the limit is', () => {
    lab().setText('x'.repeat(MAX_MESSAGE_LENGTH + 1));
    expect(lab().analyze()).toBe(false);
    expect(lab().error).toBe(LAB_ERRORS.tooLong);
    expect(LAB_ERRORS.tooLong).toContain('1,600');
  });

  it('produces a draft from a sample', () => {
    analyzeSample(RECEIVED);
    expect(lab().draft?.amount).toBe(250000);
    expect(lab().error).toBeNull();
  });

  it('clears the error as soon as the user types', () => {
    lab().analyze();
    expect(lab().error).not.toBeNull();
    lab().setText('U');
    expect(lab().error).toBeNull();
  });

  it('forgets a sample sender once the box is emptied', () => {
    lab().loadSample(SAMPLES[RECEIVED]);
    expect(lab().sender).toBe(SAMPLES[RECEIVED].sender);
    lab().setText('');
    expect(lab().sender).toBeUndefined();
  });

  it('saves nothing just by analyzing', async () => {
    const before = await count();
    analyzeSample(RECEIVED);
    expect(await count()).toBe(before);
  });
});

describe('editing a draft', () => {
  it('records only real changes', () => {
    analyzeSample(BANK_ATM);
    const original = lab().draft!.fields.find((f) => f.key === 'counterparty')!.value;

    lab().editField('counterparty', 'CITY ATM');
    expect(lab().edits.text.counterparty).toBe('CITY ATM');

    lab().editField('counterparty', original);
    expect(lab().edits.text).toEqual({});
  });

  it('ignores picking the type it already has', () => {
    analyzeSample(RECEIVED);
    lab().setType(lab().draft!.type);
    expect(lab().edits.type).toBeUndefined();

    lab().setType('SENT');
    expect(lab().edits.type).toBe('SENT');
  });

  it('starts each new analysis clean', () => {
    analyzeSample(BANK_ATM);
    lab().editField('counterparty', 'X');
    lab().setEditing(true);

    analyzeSample(RECEIVED);
    expect(lab().edits.text).toEqual({});
    expect(lab().editing).toBe(false);
  });
});

describe('saving from the Lab', () => {
  it('confirms a clean record and resets the Lab', async () => {
    analyzeSample(RECEIVED);
    const r = await lab().save();

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.outcome.transaction.status).toBe('CONFIRMED');
    // The demo seed already carries this sample's reference.
    expect(r.outcome.duplicateOf?.isDemo).toBe(true);

    expect(lab().text).toBe('');
    expect(lab().draft).toBeNull();

    const stored = await transactionRepository.findById(db, r.outcome.transaction.id);
    expect(stored?.status).toBe('CONFIRMED');
    expect(stored?.maskedAccountOrPhone).toBe('07** *** 678');
  });

  it('sends a record with an unsure field to review', async () => {
    analyzeSample(BANK_ATM);
    const r = await lab().save();
    expect(r.ok && r.outcome.transaction.status).toBe('NEEDS_REVIEW');
    expect(r.ok && r.outcome.transaction.lowFields).toEqual(['counterparty']);
  });

  it('refuses to save without an amount, and keeps the draft to fix', async () => {
    const before = await count();
    analyzeSample(PROMO);

    expect(await lab().save()).toEqual({ ok: false, error: LAB_SAVE_ERRORS.noAmount });
    expect(await count()).toBe(before);
    expect(lab().draft).not.toBeNull();
  });

  it('saves a correction and records which fields changed, not their values', async () => {
    analyzeSample(BANK_ATM);
    lab().editField('counterparty', 'CITY ATM');
    const r = await lab().save();

    expect(r.ok && r.outcome.transaction).toMatchObject({
      status: 'CONFIRMED',
      counterparty: 'CITY ATM',
    });

    const events = await processingEventRepository.list(db);
    expect(events.find((e) => e.kind === 'TRANSACTION_CORRECTED')?.detail).toBe('counterparty');
    expect(JSON.stringify(events)).not.toContain('CITY ATM');
  });

  it('stores the parse result as the parser produced it, not as edited', async () => {
    analyzeSample(BANK_ATM);
    lab().editField('counterparty', 'CITY ATM');
    const r = await lab().save();
    if (!r.ok) throw new Error(r.error);

    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM parse_results WHERE id = ?',
      [r.outcome.transaction.parseResultId!],
    );
    expect(row?.payload).toBeDefined();
    expect(row?.payload).not.toContain('CITY ATM');
  });

  it('fails cleanly when the write fails, keeping the draft to retry', async () => {
    analyzeSample(RECEIVED);
    const failing = {
      ...db,
      withTransactionAsync: () => Promise.reject(new Error('disk full')),
    } as unknown as SqlDatabase;
    await useAppStore.getState().initialize({ database: failing, now: () => NOW });

    expect(await lab().save()).toEqual({ ok: false, error: LAB_ERRORS.saveFailed });
    expect(lab().draft).not.toBeNull();
  });
});

describe('rejecting and discarding', () => {
  it('records a rejection without message content, and keeps the text', async () => {
    analyzeSample(RECEIVED);
    await lab().reject();

    expect(lab().draft).toBeNull();
    expect(lab().text).toBe(SAMPLES[RECEIVED].text);

    const events = await processingEventRepository.list(db);
    expect(events.find((e) => e.kind === 'PARSE_REJECTED')?.detail).toMatch(/PAYMENT_RECEIVED/);

    const serialized = JSON.stringify(events);
    for (const secret of ['MWAKASEGE', '0712345678', '250,000', 'QH42T8LM9P']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('discards everything and saves nothing', async () => {
    const before = await count();
    analyzeSample(RECEIVED);
    lab().discard();

    expect(lab()).toMatchObject({ text: '', draft: null, error: null, editing: false });
    expect(await count()).toBe(before);
  });
});
