import type { SqlDatabase } from '../database/client';
import { categoryRuleRepository } from '../database/repositories';
import { useAppStore } from '../features/transactions/store';
import { TZ } from './fixtures/tz-messages';
import { createMigratedDatabase } from './support/nodeSqlite';

const NOW = '2026-09-12T08:00:00.000Z';
const app = () => useAppStore.getState();

let db: SqlDatabase;
let n = 0;

beforeEach(async () => {
  db = await createMigratedDatabase();
  n = 0;
  await app().initialize({ database: db, now: () => NOW, makeId: (p) => `${p}-${++n}` });
});
afterEach(() => db.closeAsync());

describe('fees, taxes and category on a saved record', () => {
  it('are saved and read back as parsed', async () => {
    const { transaction } = await app().analyzeAndSave(TZ.mixxBetting);
    expect(transaction).toMatchObject({
      fee: 600,
      moneyCategory: 'BETTING',
      taxes: [{ code: 'VAT', amount: 92, within: 'fee' }],
    });

    const saved = app().transactions.find((t) => t.id === transaction.id)!;
    expect(saved.fee).toBe(600);
    expect(saved.taxes).toEqual(transaction.taxes);
    expect(saved.details).toEqual(transaction.details);
  });

  it('keep the LUKU token on the record', async () => {
    const { transaction } = await app().analyzeAndSave(TZ.lukuReceipt);
    const saved = app().transactions.find((t) => t.id === transaction.id)!;
    expect(saved.details.token).toBe('1111 2222 3333 4444 5555');
    expect(saved.moneyCategory).toBe('ELECTRICITY_WATER');
  });
});

describe('remembered categories', () => {
  it('file the next message to the same recipient the way the user chose', async () => {
    const { transaction } = await app().analyzeAndSave(TZ.mixxBetting);
    await app().correct(
      transaction.id,
      { moneyCategory: 'OTHER_SPENDING' },
      { rememberCategory: true },
    );

    expect(app().categoryRules).toEqual({ HELABET: 'OTHER_SPENDING' });
    expect(app().analyze(TZ.mixxBettingSmall).moneyCategory).toBe('OTHER_SPENDING');

    await app().initialize({ database: db, now: () => NOW });
    expect(app().analyze(TZ.mixxBettingSmall).moneyCategory).toBe('OTHER_SPENDING');
  });

  it('are not taken from a category the rules picked', async () => {
    const { transaction } = await app().analyzeAndSave(TZ.mixxBetting);
    await app().correct(transaction.id, { moneyCategory: 'OTHER_SPENDING' });
    expect(app().categoryRules).toEqual({});
  });

  it('can be forgotten on their own', async () => {
    const { transaction } = await app().analyzeAndSave(TZ.mixxBetting);
    await app().correct(
      transaction.id,
      { moneyCategory: 'OTHER_SPENDING' },
      { rememberCategory: true },
    );

    expect(await app().forgetCategoryRules()).toBe(1);
    expect(app().categoryRules).toEqual({});
    expect(app().analyze(TZ.mixxBettingSmall).moneyCategory).toBe('BETTING');
  });

  it('go with the records when every transaction is deleted: they hold names', async () => {
    const { transaction } = await app().analyzeAndSave(TZ.mixxBetting);
    await app().correct(
      transaction.id,
      { moneyCategory: 'OTHER_SPENDING' },
      { rememberCategory: true },
    );

    await app().deleteAllTransactions();
    expect(app().categoryRules).toEqual({});
    expect(await categoryRuleRepository.list(db)).toEqual({});
  });
});
