/**
 * The account's one bulk import: splitting the paste, what happens to each
 * message, and the import itself against a real database and a fake server.
 */
import type { SqlDatabase } from '../database/client';
import { classifyImport, countByStatus, importCutoff, planImport } from '../features/import/plan';
import { splitMessages } from '../features/import/split';
import { createImportStore, IMPORT_ERRORS, type BulkImportApi } from '../features/import/store';
import { parseMessage } from '../features/parser';
import { useAppStore } from '../features/transactions/store';
import { TZ } from './fixtures/tz-messages';
import { HALOPESA } from './fixtures/tz/halopesa';
import { MPESA } from './fixtures/tz/mpesa';
import { createMigratedDatabase } from './support/nodeSqlite';

const NOW = new Date(2026, 8, 14, 12, 0);
const NOW_ISO = NOW.toISOString();

// Invented, like every fixture.
const OTP = 'Airtel Money: Nenosiri lako la muda ni 482913. Usimpe mtu yeyote.';
const PROMO = 'M-PESA: Pata bonasi ya 10% ukinunua bando kupitia M-PESA. Piga *150*00#';
const NO_DATE = 'Umetuma pesa kwa PETRO NYONI,\nkiasi Tsh 9,500/=,\nAda ----';
/** Dated 2013. */
const OLD = MPESA[0].sms;

describe('splitting a paste', () => {
  it('splits on blank lines and on lines of dashes', () => {
    expect(splitMessages(`${TZ.mixxBetting}\n\n${TZ.mixxBettingSmall}\n-----\n${OTP}`)).toEqual([
      TZ.mixxBetting,
      TZ.mixxBettingSmall,
      OTP,
    ]);
  });

  it('keeps a message that runs over several lines whole', () => {
    expect(splitMessages(`${MPESA[0].sms}\n\n${HALOPESA[0].sms}`)).toEqual([
      MPESA[0].sms,
      HALOPESA[0].sms,
    ]);
  });

  it('splits messages that follow one another with no blank line', () => {
    expect(splitMessages(`${TZ.mixxLipaMerchant}\n${TZ.mixxToPerson}\n${MPESA[1].sms}`)).toEqual([
      TZ.mixxLipaMerchant,
      TZ.mixxToPerson,
      MPESA[1].sms,
    ]);
  });

  it('reads Windows line endings and trims each line', () => {
    expect(splitMessages(`  ${TZ.mixxBetting}  \r\n\r\n${TZ.mixxBettingSmall}\r\n`)).toEqual([
      TZ.mixxBetting,
      TZ.mixxBettingSmall,
    ]);
  });
});

describe('what happens to each message', () => {
  const read = (text: string) => parseMessage(text);
  const plan = planImport(
    [TZ.mixxLipaMerchant, OLD, OTP, PROMO, TZ.mixxLipaMerchant, 'Habari, tutaonana kesho', NO_DATE],
    read,
    NOW,
  );

  it('saves money from the last 90 days', () => {
    expect(plan[0]).toMatchObject({ status: 'save', note: null });
  });

  it('leaves out messages older than 90 days', () => {
    expect(plan[1]).toMatchObject({ status: 'old', note: 'Older than 90 days' });
  });

  it('never keeps a one-time code, not even its text', () => {
    expect(plan[2]).toEqual({
      id: 'm3',
      text: '',
      result: null,
      status: 'secret',
      note: 'A one-time code: never stored',
    });
  });

  it('leaves out promotions, and text with no number in it', () => {
    expect(plan[3]).toMatchObject({ status: 'notMoney', note: 'A promotion' });
    expect(plan[5]).toMatchObject({ status: 'notMoney', note: 'No amount or number in it' });
  });

  it('saves a transaction pasted twice once', () => {
    expect(plan[4]).toMatchObject({ status: 'repeat' });
  });

  it('saves money with no date for review, since it would land on today', () => {
    expect(plan[6]).toMatchObject({ status: 'review' });
  });

  it('counts each outcome', () => {
    expect(countByStatus(plan)).toEqual({
      save: 1,
      review: 1,
      repeat: 1,
      old: 1,
      notMoney: 2,
      secret: 1,
      tooLong: 0,
    });
  });

  it('counts 90 days back from midnight', () => {
    const cutoff = importCutoff(NOW);
    expect(cutoff).toEqual(new Date(2026, 5, 16));
    const on = (date: string) =>
      classifyImport(read(TZ.mixxBetting.replace('12/09/26', date)), cutoff).status;
    expect(on('16/06/26')).toBe('save');
    expect(on('15/06/26')).toBe('old');
  });
});

describe('the import', () => {
  let db: SqlDatabase;
  let server: { usedAt: string | null; claims: number; failing: boolean };

  const api: BulkImportApi = {
    async usedAt() {
      if (server.failing) throw new Error('offline');
      return server.usedAt;
    },
    async claim() {
      if (server.failing) throw new Error('offline');
      server.claims += 1;
      if (server.usedAt) return { claimed: false, usedAt: server.usedAt };
      server.usedAt = NOW_ISO;
      return { claimed: true, usedAt: NOW_ISO };
    },
  };
  const make = () => createImportStore(api, { now: () => NOW, pause: async () => {} });

  const PASTE = [TZ.mixxLipaMerchant, TZ.mixxToPerson, OTP, NO_DATE, OLD].join('\n\n');

  const importedCount = async () =>
    (await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) AS n FROM messages WHERE source = 'IMPORT'",
    ))!.n;

  const readPaste = async () => {
    const s = make();
    await s.getState().check();
    s.getState().setText(PASTE);
    await s.getState().read();
    return s;
  };

  beforeEach(async () => {
    db = await createMigratedDatabase();
    server = { usedAt: null, claims: 0, failing: false };
    await useAppStore.getState().initialize({ database: db, now: () => NOW_ISO });
  });
  afterEach(() => db.closeAsync());

  it('is ready while the account has not used its import', async () => {
    const s = make();
    await s.getState().check();
    expect(s.getState().phase).toBe('ready');
  });

  it('says when the import was already used', async () => {
    server.usedAt = '2026-09-01T10:00:00.000Z';
    const s = make();
    await s.getState().check();
    expect(s.getState()).toMatchObject({ phase: 'used', usedAt: '2026-09-01T10:00:00.000Z' });
  });

  it('asks for a paste first', async () => {
    const s = make();
    await s.getState().check();
    await s.getState().read();
    expect(s.getState()).toMatchObject({ phase: 'ready', error: IMPORT_ERRORS.empty });
  });

  it('reads the paste and shows what will happen, saving nothing yet', async () => {
    const s = await readPaste();
    expect(s.getState().phase).toBe('preview');
    expect(s.getState().items.map((i) => i.status)).toEqual([
      'save',
      'save',
      'secret',
      'review',
      'old',
    ]);
    expect(server.claims).toBe(0);
    expect(await importedCount()).toBe(0);
  });

  it('imports what was chosen, and uses the account’s import', async () => {
    const s = await readPaste();
    s.getState().toggle('m2');
    await s.getState().run();

    expect(s.getState()).toMatchObject({
      phase: 'done',
      outcome: { saved: 2, forReview: 1, repeats: 0 },
      text: '',
      items: [],
    });
    expect(server.claims).toBe(1);

    const rows = await db.getAllAsync<{ original_text: string }>(
      "SELECT original_text FROM messages WHERE source = 'IMPORT'",
    );
    expect(rows.map((r) => r.original_text).sort()).toEqual([NO_DATE, TZ.mixxLipaMerchant].sort());

    // Without a date it would land on today: it waits for one.
    const undated = useAppStore.getState().transactions.find((t) => t.amount === 9500)!;
    expect(undated.status).toBe('NEEDS_REVIEW');
    expect(undated.lowFields).toContain('date');

    // The one-time code was never stored.
    const all = await db.getAllAsync<{ original_text: string }>(
      'SELECT original_text FROM messages',
    );
    expect(all.some((r) => r.original_text.includes('482913'))).toBe(false);
  });

  it('marks imported records as imported', async () => {
    const s = await readPaste();
    await s.getState().run();
    const record = useAppStore
      .getState()
      .transactions.find((t) => t.transactionReference === '26700000000001')!;
    expect(await useAppStore.getState().getRecordSource(record.sourceMessageId)).toMatchObject({
      imported: true,
    });
  });

  it('saves nothing when the account’s import was already used', async () => {
    const s = await readPaste();
    server.usedAt = '2026-09-01T10:00:00.000Z';
    await s.getState().run();
    expect(s.getState()).toMatchObject({
      phase: 'used',
      error: IMPORT_ERRORS.alreadyUsed,
      items: [],
      text: '',
    });
    expect(await importedCount()).toBe(0);
  });

  it('saves nothing, and keeps the preview, when the server cannot be reached', async () => {
    const s = await readPaste();
    server.failing = true;
    await s.getState().run();
    expect(s.getState()).toMatchObject({ phase: 'preview', error: IMPORT_ERRORS.offline });
    expect(s.getState().items).toHaveLength(5);
    expect(await importedCount()).toBe(0);
  });

  it('skips a transaction that is already saved', async () => {
    await useAppStore.getState().analyzeAndSave(TZ.mixxLipaMerchant);
    const s = await readPaste();
    await s.getState().run();
    expect(s.getState().outcome).toEqual({ saved: 2, forReview: 1, repeats: 1 });
  });
});
