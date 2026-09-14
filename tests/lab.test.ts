import type { SqlDatabase } from '../database/client';
import { processingEventRepository, transactionRepository } from '../database/repositories';
import { LAB_SAVE_ERRORS } from '../features/lab/draft';
import { LAB_ERRORS, useLabStore, type LabSaveResult } from '../features/lab/store';
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

const analyzeSample = async (i: number) => {
  lab().loadSample(SAMPLES[i]);
  await expect(lab().analyze()).resolves.toBe(true);
};

const count = async () => (await transactionRepository.list(db)).length;

describe('analyzing in the Lab', () => {
  it('refuses an empty message', async () => {
    lab().setText('   ');
    await expect(lab().analyze()).resolves.toBe(false);
    expect(lab().error).toBe(LAB_ERRORS.empty);
    expect(lab().draft).toBeNull();
  });

  it('refuses an over-long message, and says where the limit is', async () => {
    lab().setText('x'.repeat(MAX_MESSAGE_LENGTH + 1));
    await expect(lab().analyze()).resolves.toBe(false);
    expect(lab().error).toBe(LAB_ERRORS.tooLong);
    expect(LAB_ERRORS.tooLong).toContain('1,600');
  });

  it('produces a draft from a sample', async () => {
    await analyzeSample(RECEIVED);
    expect(lab().draft?.amount).toBe(250000);
    expect(lab().error).toBeNull();
  });

  it('clears the error as soon as the user types', async () => {
    await lab().analyze();
    expect(lab().error).not.toBeNull();
    lab().setText('U');
    expect(lab().error).toBeNull();
  });

  it('forgets a sample sender once the box is emptied', async () => {
    lab().loadSample(SAMPLES[RECEIVED]);
    expect(lab().sender).toBe(SAMPLES[RECEIVED].sender);
    lab().setText('');
    expect(lab().sender).toBeUndefined();
  });

  it('saves nothing just by analyzing', async () => {
    const before = await count();
    await analyzeSample(RECEIVED);
    expect(await count()).toBe(before);
  });
});

describe('editing a draft', () => {
  it('records only real changes', async () => {
    await analyzeSample(BANK_ATM);
    const original = lab().draft!.fields.find((f) => f.key === 'counterparty')!.value;

    lab().editField('counterparty', 'CITY ATM');
    expect(lab().edits.text.counterparty).toBe('CITY ATM');

    lab().editField('counterparty', original);
    expect(lab().edits.text).toEqual({});
  });

  it('ignores picking the type it already has', async () => {
    await analyzeSample(RECEIVED);
    lab().setType(lab().draft!.type);
    expect(lab().edits.type).toBeUndefined();

    lab().setType('SENT');
    expect(lab().edits.type).toBe('SENT');
  });

  it('starts each new analysis clean', async () => {
    await analyzeSample(BANK_ATM);
    lab().editField('counterparty', 'X');
    lab().setEditing(true);

    await analyzeSample(RECEIVED);
    expect(lab().edits.text).toEqual({});
    expect(lab().editing).toBe(false);
  });
});

/** The record a Lab save stored; fails the test if it stored none. */
const savedOf = (r: LabSaveResult) => {
  if (!r.ok) throw new Error(r.error);
  if (!r.outcome.saved) throw new Error('Expected a new record, but it was already saved');
  return r.outcome.transaction;
};

describe('saving from the Lab', () => {
  it('confirms a clean record and resets the Lab', async () => {
    await analyzeSample(RECEIVED);
    // The demo seed carries this sample's reference; samples never block a real record.
    const saved = savedOf(await lab().save());
    expect(saved.status).toBe('CONFIRMED');

    expect(lab().text).toBe('');
    expect(lab().draft).toBeNull();

    const stored = await transactionRepository.findById(db, saved.id);
    expect(stored?.status).toBe('CONFIRMED');
    expect(stored?.maskedAccountOrPhone).toBe('07** *** 678');
  });

  it('skips a transaction already saved, and can tell before saving', async () => {
    await analyzeSample(RECEIVED);
    const first = savedOf(await lab().save());

    await analyzeSample(RECEIVED);
    expect((await lab().findSaved())?.id).toBe(first.id);

    const before = await count();
    expect(await lab().save()).toMatchObject({
      ok: true,
      outcome: { saved: false, duplicateOf: { id: first.id } },
    });
    expect(await count()).toBe(before);
  });

  it('treats a corrected reference as a different transaction', async () => {
    await analyzeSample(RECEIVED);
    savedOf(await lab().save());

    await analyzeSample(RECEIVED);
    lab().editField('reference', 'NEWREF123');
    expect(await lab().findSaved()).toBeNull();
    expect(savedOf(await lab().save()).transactionReference).toBe('NEWREF123');
  });

  it('sends a record with an unsure field to review', async () => {
    await analyzeSample(BANK_ATM);
    const saved = savedOf(await lab().save());
    expect(saved.status).toBe('NEEDS_REVIEW');
    expect(saved.lowFields).toEqual(['counterparty']);
  });

  it('refuses to save without an amount, and keeps the draft to fix', async () => {
    const before = await count();
    await analyzeSample(PROMO);

    expect(await lab().save()).toEqual({ ok: false, error: LAB_SAVE_ERRORS.noAmount });
    expect(await count()).toBe(before);
    expect(lab().draft).not.toBeNull();
  });

  it('saves a correction and records which fields changed, not their values', async () => {
    await analyzeSample(BANK_ATM);
    lab().editField('counterparty', 'CITY ATM');

    expect(savedOf(await lab().save())).toMatchObject({
      status: 'CONFIRMED',
      counterparty: 'CITY ATM',
    });

    const events = await processingEventRepository.list(db);
    expect(events.find((e) => e.kind === 'TRANSACTION_CORRECTED')?.detail).toBe('counterparty');
    expect(JSON.stringify(events)).not.toContain('CITY ATM');
  });

  it('stores the parse result as the parser produced it, not as edited', async () => {
    await analyzeSample(BANK_ATM);
    lab().editField('counterparty', 'CITY ATM');
    const saved = savedOf(await lab().save());

    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM parse_results WHERE id = ?',
      [saved.parseResultId!],
    );
    expect(row?.payload).toBeDefined();
    expect(row?.payload).not.toContain('CITY ATM');
  });

  it('fails cleanly when the write fails, keeping the draft to retry', async () => {
    await analyzeSample(RECEIVED);
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
    await analyzeSample(RECEIVED);
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
    await analyzeSample(RECEIVED);
    lab().discard();

    expect(lab()).toMatchObject({ text: '', draft: null, error: null, editing: false });
    expect(await count()).toBe(before);
  });
});
