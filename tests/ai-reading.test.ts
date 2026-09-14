import type { SqlDatabase } from '../database/client';
import { categoryRuleRepository } from '../database/repositories';
import { maskForAi } from '../features/ai/mask';
import { modelName, readWithAi, rulesWithNote, writtenDate } from '../features/ai/merge';
import {
  AI_FAILURE_NOTES,
  AiUnavailableError,
  type AiAnswer,
  type AiReader,
  type AiReading,
  type AiRequest,
} from '../features/ai/reading';
import { parseMessage, partyKey, SAMPLES } from '../features/parser';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

const MODEL = 'claude-haiku-4-5-20251001';
const NOW = '2026-09-14T08:00:00.000Z';
const app = useAppStore.getState;

// The first demo sample: invented, with an invented number.
const SAMPLE = SAMPLES[0];

/** What Claude would answer for the first demo sample. */
const reading = (over: Partial<AiReading> = {}): AiReading => ({
  id: 'm1',
  isMoney: true,
  category: 'PAYMENT_RECEIVED',
  provider: 'M-Pesa',
  amount: 250000,
  currency: 'TZS',
  fee: null,
  taxes: [],
  counterparty: 'JOHN MWAKASEGE',
  counterpartyNumber: '07** *** 678',
  reference: 'QH42T8LM9P',
  balanceAfter: 812400,
  date: '2026-03-12',
  time: '14:22',
  moneyCategory: 'RECEIVED_FROM_PEOPLE',
  merchant: false,
  network: null,
  unsure: [],
  ...over,
});

const field = (r: { fields: { key: string; low: boolean }[] }, key: string) =>
  r.fields.find((f) => f.key === key);

describe('what leaves the phone for AI reading', () => {
  it('masks phone numbers however they are written', () => {
    expect(maskForAi('Umetuma kwa 0712345678.')).toBe('Umetuma kwa 07** *** 678.');
    expect(maskForAi('to 255712345678 now')).toBe('to +255 7** *** 678 now');
    expect(maskForAi('to +255712345678')).toBe('to +255 7** *** 678');
  });

  it('masks account, card and meter numbers, and LUKU tokens', () => {
    expect(maskForAi('Account no: 0150123456789 debited')).toBe('Account no: **** 6789 debited');
    expect(maskForAi('Mita 12345678901 units')).toBe('Mita **** 8901 units');
    expect(maskForAi('Token 1111 2222 3333 4444 5555')).toBe('Token **** **** **** **** 5555');
  });

  it('keeps references, amounts and names for the AI to read', () => {
    const text = 'Kumbukumbu no 26304567533927. Umelipa TSh 20,000 kwa ALICE NDOSI. Ref QH42T8LM9P';
    expect(maskForAi(text)).toBe(text);
  });
});

describe('a reading from Claude, checked against the rules', () => {
  const rules = parseMessage(SAMPLE.text, { sender: SAMPLE.sender });

  it("takes what Claude read, keeping a known sender's registry name", () => {
    const r = readWithAi(rules, reading(), MODEL);
    expect(r).toMatchObject({
      provider: rules.provider,
      providerId: rules.providerId,
      amount: 250000,
      transactionReference: 'QH42T8LM9P',
      transactionDate: '12 Mar 2026',
      transactionTime: '14:22',
      band: 'Very high',
    });
    expect(r.parserId).toContain('Claude Haiku 4.5');
    expect(field(r, 'amount')?.low).toBe(false);
  });

  it('flags a figure the rules read differently', () => {
    const r = readWithAi(rules, reading({ amount: 25000 }), MODEL);
    expect(r.amount).toBe(25000);
    expect(field(r, 'amount')?.low).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/read the amount differently/);
    expect(r.confidence).toBeLessThan(0.95);
  });

  it('falls back to the rules for what Claude left out', () => {
    const r = readWithAi(rules, reading({ reference: null, balanceAfter: null }), MODEL);
    expect(r.transactionReference).toBe(rules.transactionReference);
    expect(r.balanceAfter).toBe(rules.balanceAfter);
  });

  it('masks any full number Claude hands back', () => {
    const r = readWithAi(rules, reading({ counterparty: 'ALICE 0712345678' }), MODEL);
    expect(r.counterparty).toBe('ALICE 07** *** 678');
  });

  it('keeps a message that is not money out of the money', () => {
    const r = readWithAi(
      rules,
      reading({ isMoney: false, category: 'PROMOTIONAL', moneyCategory: 'BETTING' }),
      MODEL,
    );
    expect(r.type).toBe('UNKNOWN');
    expect(r.moneyCategory).toBeNull();
    expect(r.confidence).toBeLessThanOrEqual(0.52);
  });

  it('writes dates and model names the way the app does', () => {
    expect(writtenDate('2026-03-12')).toBe('12 Mar 2026');
    expect(writtenDate('2026-02-30')).toBeNull();
    expect(writtenDate(null)).toBeNull();
    expect(modelName(MODEL)).toBe('Claude Haiku 4.5');
    expect(modelName('something-else')).toBe('Claude');
  });

  it('says why when the rules read it alone', () => {
    expect(rulesWithNote(rules, 'limit').warnings[0]).toBe(AI_FAILURE_NOTES.limit);
  });
});

describe('reading a message in the app', () => {
  let db: SqlDatabase;
  const sent: AiRequest[][] = [];

  const reader = (answer: (messages: AiRequest[]) => Promise<AiAnswer>): AiReader => ({
    async read(messages) {
      sent.push(messages);
      return answer(messages);
    },
  });
  const claude = reader(async (messages) => ({
    model: MODEL,
    readings: [reading({ id: messages[0].id })],
  }));

  const start = async (ai: AiReader | null, agreed = true) => {
    await app().initialize({ database: db, now: () => NOW, ai });
    if (agreed) await app().setSetting('aiReadingAccepted', true);
  };

  beforeEach(async () => {
    db = await createMigratedDatabase();
    sent.length = 0;
  });
  afterEach(async () => {
    await app().initialize({ database: db, now: () => NOW, ai: null });
    await db.closeAsync();
  });

  it('reads with Claude once agreed, sending the message with numbers masked', async () => {
    await start(claude);
    const text = 'Umepokea TSh 250,000 kutoka JOHN MWAKASEGE 0712345678. Muamala QH42T8LM9P.';
    const r = await app().read(text, 'DEMO-WALLET-A');

    expect(r.parserId).toContain('Claude');
    expect(sent).toHaveLength(1);
    expect(sent[0][0].text).not.toContain('0712345678');
    expect(sent[0][0].text).toContain('QH42T8LM9P');
  });

  it('keeps to the on-phone rules until the person agrees', async () => {
    await start(claude, false);
    const r = await app().read(SAMPLE.text, SAMPLE.sender);
    expect(sent).toHaveLength(0);
    expect(r.parserId).not.toContain('Claude');
  });

  it('falls back to the rules, and says why, when AI reading fails', async () => {
    await start({
      read: async () => {
        throw new AiUnavailableError('offline');
      },
    });
    const r = await app().read(SAMPLE.text, SAMPLE.sender);
    expect(r.warnings[0]).toBe(AI_FAILURE_NOTES.offline);
    expect(r.amount).toBe(250000);
  });

  it('still files the recipient the way the person chose', async () => {
    await categoryRuleRepository.set(db, partyKey('JOHN MWAKASEGE')!, 'SALARY', NOW);
    await start(claude);
    const r = await app().read(SAMPLE.text, SAMPLE.sender);
    expect(r.moneyCategory).toBe('SALARY');
  });

  it('saves what Claude read', async () => {
    await start(
      reader(async (messages) => ({
        model: MODEL,
        readings: [reading({ id: messages[0].id, counterparty: 'JOHN M. MWAKASEGE' })],
      })),
    );
    const out = await app().analyzeAndSave(SAMPLE.text, SAMPLE.sender);
    expect(out.saved && out.transaction.counterparty).toBe('JOHN M. MWAKASEGE');
  });
});
