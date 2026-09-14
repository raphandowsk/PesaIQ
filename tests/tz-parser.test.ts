/**
 * The Tanzania mobile-money parser's parts, one specification section at a
 * time, and how its readings appear in the app. The per-operator layouts are
 * in tz-fixtures.test.ts.
 */
import type { SqlDatabase } from '../database/client';
import { parseMessage, SAMPLES, validateParseResult } from '../features/parser';
import {
  classifyTransaction,
  detectDirection,
  displayDate,
  extractTransactionId,
  extractTzDateTime,
  maskTzPhone,
  normalizeSms,
  normalizeTzPhone,
  operatorEvidence,
  parseAmount,
  parseTanzaniaSms,
  parseTanzaniaTransaction,
  PARSER_VERSION,
  scoreTzConfidence,
  selectHighestConfidence,
  TZ_CONFIDENCE_WEIGHTS,
  tzConfidenceLevel,
} from '../features/parser/tz';
import { HALOPESA_PATTERNS, MIXX_PATTERNS, TPESA_PATTERNS } from '../features/parser/tz/patterns';
import { useAppStore } from '../features/transactions/store';
import { TZ } from './fixtures/tz-messages';
import { createMigratedDatabase } from './support/nodeSqlite';

const msg = (body: string, sender?: string) => normalizeSms({ body, sender });

/** §40's example, with invented name and code. */
const SPEC_EXAMPLE =
  'M-PESA K82PM107 imethibitishwa umepokea Tsh. 30,000\nkutoka kwa HALIMA KIWELU tarehe 8/8/13 saa 7:52 PM\nSalio lako la M-PESA ni Tsh.30,490.';

const HALO_WITH_LEVY =
  'Utambulisho wa Muamala: 3122700002.\nUmetuma TSH 50,000.00 kwenda Airtel Money,\njina KASSIM OMARY,\ngharama TSH 1,210.00\n(HaloPesa TSH 1,200.00 + TOZO ya serikali TSH 10.00),\nwakati 2025/04/02 08:15:10.\nSalio lako jipya ni TSH 8,790.00.\nAhsante!';

const PROMO = 'M-PESA: Pata bonasi ya 10% ukinunua bando kupitia M-PESA. Piga *150*00#';

describe('amounts (§24)', () => {
  it.each([
    'Tsh 10,000',
    'Tsh. 10,000',
    'Tsh10,000',
    'TZS 10,000',
    'TSH 10,000.00',
    '10,000 Tsh',
    '10,000 TZS',
    '10,000/=',
    '10,000/-',
  ])('reads "%s" as 10000', (written) => {
    expect(parseAmount(written)).toBe(10000);
  });

  it('reads cents and "Tshs"', () => {
    expect(parseAmount('172.00 Tshs')).toBe(172);
  });

  it('rejects what is not an amount', () => {
    expect(parseAmount('----')).toBeNull();
    expect(parseAmount('TSH')).toBeNull();
    expect(parseAmount(null)).toBeNull();
  });
});

describe('phone numbers (§25)', () => {
  it.each(['0712345678', '+255712345678', '255712345678', '712345678', '+255 712 345 678'])(
    'normalizes %s to +255712345678',
    (written) => {
      expect(normalizeTzPhone(written)).toBe('+255712345678');
    },
  );

  it('rejects a number that is not Tanzanian', () => {
    expect(normalizeTzPhone('12345')).toBeNull();
  });

  it('keeps only the masked form', () => {
    expect(maskTzPhone('+255 712 345 678')).toBe('07** *** 678');
  });
});

describe('dates and times', () => {
  it('reads the historical M-Pesa form, 12-hour', () => {
    expect(extractTzDateTime('Tarehe 21/6/13 saa 11:07 AM')).toEqual({
      date: '2013-06-21',
      time: '11:07',
    });
  });

  it('puts PM on the 24-hour clock, and 12 AM at midnight', () => {
    expect(extractTzDateTime('tarehe 8/8/13 saa 7:52 PM').time).toBe('19:52');
    expect(extractTzDateTime('1/1/25 saa 12:15 AM').time).toBe('00:15');
    expect(extractTzDateTime('1/1/25 saa 12:15 PM').time).toBe('12:15');
  });

  it("reads HaloPesa's year-first timestamp", () => {
    expect(extractTzDateTime('wakati 2025/03/29 13:32:54.')).toEqual({
      date: '2025-03-29',
      time: '13:32',
    });
  });

  it("reads the M-Pesa receipt's written date", () => {
    expect(extractTzDateTime('Date 23 June 2025, 11:59')).toEqual({
      date: '2025-06-23',
      time: '11:59',
    });
  });

  it('drops a date that cannot exist, and says so', () => {
    const r = extractTzDateTime('31/02/25 10:00');
    expect(r.date).toBeNull();
    expect(r.warning).toMatch(/not a real date/);
  });

  it('writes dates the way the app does', () => {
    expect(displayDate('2013-08-08T19:52:00')).toBe('08 Aug 2013');
  });
});

describe('transaction IDs (§26)', () => {
  it.each([
    ['Kumbukumbu No: PP240910.1530.A98765', 'PP240910.1530.A98765'],
    ['Kumbukumbu Namba TP2409150001', 'TP2409150001'],
    ['Txn Id : ER240901.1234.B12345,', 'ER240901.1234.B12345'],
    ['Transaction ID: TX99887766', 'TX99887766'],
    ['Receipt Number TST4QWE9XY1', 'TST4QWE9XY1'],
    ['Reference No. RF55443322', 'RF55443322'],
    ['Ref: QH42T8LM9P.', 'QH42T8LM9P'],
    ['Utambulisho wa Muamala: 3122700001.', '3122700001'],
    ['Q71KD552 Imethibitishwa', 'Q71KD552'],
  ])('reads "%s"', (text, id) => {
    expect(extractTransactionId(text)?.value).toBe(id);
  });

  it('needs a digit, so a label before an ordinary word is no ID', () => {
    expect(extractTransactionId('Kila Muamala ni Bao la Ushindi!')).toBeNull();
  });

  it('never takes a bill reference for the transaction', () => {
    expect(extractTransactionId('Bill Reference 255700000222')).toBeNull();
  });
});

describe('which operator (§27, §28)', () => {
  it('weighs a documented sender ID as a hint worth 0.50, not proof', () => {
    const e = operatorEvidence(
      msg('Umetuma pesa kwa ZAWADI MREMA, kiasi Tsh 1,000/='),
      TPESA_PATTERNS,
    );
    expect(e.score).toBe(0);
    expect(
      operatorEvidence(
        msg('Umetuma pesa kwa ZAWADI MREMA, kiasi Tsh 1,000/=', 'TPESA'),
        TPESA_PATTERNS,
      ).score,
    ).toBe(0.5);
  });

  it('does not count the network the money went to', () => {
    const m = msg(TZ.mixxToOtherNetwork);
    expect(operatorEvidence(m, HALOPESA_PATTERNS).score).toBe(0);
    expect(operatorEvidence(m, MIXX_PATTERNS).score).toBeGreaterThanOrEqual(0.5);
  });

  it("counts another operator's evidence against", () => {
    const both = msg('Utambulisho wa Muamala: 3122700009. Salio jipya ni TSH 1,000.');
    const e = operatorEvidence(both, HALOPESA_PATTERNS);
    expect(e.score).toBe(0);
    expect(e.signals).toContain('Also looks like Mixx by Yas');
  });

  it('pins a layout four operators share on none of them', () => {
    expect(
      parseTanzaniaSms({ body: 'Umetuma pesa kwa ZAWADI MREMA,\nkiasi Tsh 1,000/=,\nAda ----' }),
    ).toBeNull();
  });
});

describe('what kind of transaction (§29)', () => {
  const kind = (text: string) =>
    classifyTransaction({
      text,
      direction: detectDirection(text),
      hasAmount: true,
      hasBalance: false,
    }).type;

  it('lets the specialized kind win: money from GePG is a government payment', () => {
    expect(kind('Umepokea Tsh 20,000 kutoka GePG')).toBe('GOVERNMENT_PAYMENT');
  });

  it('puts a reversal before money received', () => {
    expect(kind('Muamala imerejeshwa. Umepokea Tsh 5,000')).toBe('REVERSAL');
  });

  it('reads a bank transfer from a bank AND transfer wording, each way', () => {
    expect(kind('Umepokea Tsh 5,000 kutoka NMB BANK')).toBe('BANK_TRANSFER_IN');
    expect(kind('Umetuma Tsh 5,000 kwenda CRDB BANK akaunti 0150000123456')).toBe(
      'BANK_TRANSFER_OUT',
    );
  });

  it('reads a Lipa number as a merchant, but not the verb "lipa"', () => {
    expect(kind('Umetuma Tsh 5,000 kwenda kwa Vodacom LIPA DUKA-51234567')).toBe(
      'MERCHANT_PAYMENT',
    );
    expect(kind('Malipo. Kiasi Ulicho lipa Tsh 44,000')).toBe('SENT');
  });

  it('never classifies on one word: "Umepokea" with no amount is nothing', () => {
    expect(
      classifyTransaction({
        text: 'Umepokea ujumbe mpya',
        direction: 'in',
        hasAmount: false,
        hasBalance: false,
      }).type,
    ).toBe('UNKNOWN');
  });

  it('keeps codes and promotions out', () => {
    const none = { direction: null, hasAmount: false, hasBalance: false } as const;
    expect(classifyTransaction({ text: 'Nenosiri lako ni 482913', ...none }).notMoney).toBe('OTP');
    expect(classifyTransaction({ text: 'Pata bonasi! Piga *150*00#', ...none }).notMoney).toBe(
      'PROMOTIONAL',
    );
  });

  it('reads which way the money moved from the first telling word', () => {
    expect(detectDirection('Umepokea malipo')).toBe('in');
    expect(detectDirection('Malipo yamekamilika kwenda HELABET')).toBe('out');
    expect(detectDirection('Habari njema')).toBeNull();
  });
});

describe('confidence (§45, §53)', () => {
  const all = {
    operatorScore: 1,
    typeKnown: true,
    amount: true,
    transactionId: true,
    party: true,
    balance: true,
    date: true,
    time: true,
    problems: 0,
  };

  it('weighs the eight factors as the specification does, adding to 1', () => {
    expect(Object.values(TZ_CONFIDENCE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(scoreTzConfidence(all).factors).toHaveLength(8);
  });

  it('never goes above 0.98: an SMS is not a verified payment', () => {
    expect(scoreTzConfidence(all).confidence).toBe(0.98);
  });

  it('takes 0.1 off for each field that does not add up', () => {
    expect(scoreTzConfidence({ ...all, problems: 1 }).confidence).toBe(0.9);
  });

  it("reads the specification's own example at 0.98", () => {
    expect(parseTanzaniaTransaction({ body: SPEC_EXAMPLE })).toMatchObject({
      operator: 'MPESA_TZ',
      transactionType: 'RECEIVED',
      status: 'SUCCESS',
      transactionId: 'K82PM107',
      amount: 30000,
      currency: 'TZS',
      sender: { name: 'HALIMA KIWELU' },
      balance: 30490,
      transactionAt: '2013-08-08T19:52:00',
      confidence: 0.98,
    });
  });

  it('labels scores the way §45 does', () => {
    expect(tzConfidenceLevel(0.9)).toBe('HIGH');
    expect(tzConfidenceLevel(0.7)).toBe('MEDIUM');
    expect(tzConfidenceLevel(0.5)).toBe('LOW');
  });
});

describe('the master parser (§37, §43)', () => {
  it('picks the most confident reading', () => {
    const a = parseTanzaniaTransaction({ body: SPEC_EXAMPLE })!;
    const b = { ...a, confidence: 0.6 };
    expect(selectHighestConfidence([b, a])).toBe(a);
  });

  it('keeps a message below 0.50 as UNKNOWN, for review, with the parser version', () => {
    const o = parseTanzaniaSms({
      body: PROMO,
      sender: 'M-PESA',
      receivedAt: '2026-09-14T08:00:00Z',
    });
    expect(o?.kind).toBe('unknown');
    if (o?.kind !== 'unknown') return;
    expect(o.unknown).toEqual({
      classification: 'UNKNOWN',
      rawSms: PROMO,
      senderId: 'M-PESA',
      receivedAt: '2026-09-14T08:00:00Z',
      parserVersion: '1.0.0',
      closest: { operator: 'MPESA_TZ', confidence: 0.25 },
    });
  });

  it('says parsed, never verified (§31)', () => {
    expect(parseTanzaniaTransaction({ body: SPEC_EXAMPLE })).toMatchObject({
      parsed: true,
      verified: false,
      parserVersion: PARSER_VERSION,
    });
  });

  it('gives the same reading every time', () => {
    expect(parseTanzaniaSms({ body: HALO_WITH_LEVY })).toEqual(
      parseTanzaniaSms({ body: HALO_WITH_LEVY }),
    );
  });
});

describe('security (§46)', () => {
  it('never extracts a one-time code', () => {
    const o = parseTanzaniaSms({
      body: 'Airtel Money: Nenosiri lako la muda ni 482913. Usimpe mtu yeyote.',
      sender: 'AIRTEL',
    });
    expect(o?.kind).toBe('unknown');
    const tx = o?.kind === 'unknown' ? o.closest : null;
    expect(tx?.nonTransaction).toBe('OTP');
    const { rawSms, ...fields } = tx!;
    expect(rawSms).toContain('482913');
    expect(JSON.stringify(fields)).not.toContain('482913');
  });

  it('writes nothing to the console, so no message can end up in a log', () => {
    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;
    const spies = methods.map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
    for (const text of [...Object.values(TZ), SPEC_EXAMPLE, HALO_WITH_LEVY, PROMO]) {
      parseMessage(text);
    }
    for (const spy of spies) {
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    }
  });
});

describe('in the app', () => {
  it('shows an M-Pesa message as M-Pesa, parsed from SMS, keeping the kind', () => {
    const r = parseMessage(SPEC_EXAMPLE);
    expect(r).toMatchObject({
      provider: 'M-Pesa',
      providerId: 'mpesa',
      category: 'PAYMENT_RECEIVED',
      type: 'RECEIVED',
      amount: 30000,
      counterparty: 'HALIMA KIWELU',
      transactionReference: 'K82PM107',
      balanceAfter: 30490,
      transactionDate: '08 Aug 2013',
      transactionTime: '19:52',
      moneyCategory: 'RECEIVED_FROM_PEOPLE',
      band: 'Very high',
      warnings: [],
    });
    expect(r.parserId).toBe('TZ mobile money 1.0.0 · M-Pesa rules (EXPERIMENTAL)');
    expect(r.details).toMatchObject({
      kind: 'RECEIVED',
      operator: 'MPESA_TZ',
      messageStatus: 'SUCCESS',
      parserVersion: '1.0.0',
    });
    expect(validateParseResult(r).ok).toBe(true);
  });

  it("keeps HaloPesa's government levy as a tax inside the fee", () => {
    const r = parseMessage(HALO_WITH_LEVY);
    expect(r.provider).toBe('HaloPesa');
    expect(r.fee).toBe(1210);
    expect(r.taxes).toEqual([{ code: 'LEVY', amount: 10, ratePct: null, within: 'fee' }]);
  });

  it('shows a reading below 0.50 as not a transaction', () => {
    const r = parseMessage(PROMO, { sender: 'M-PESA' });
    expect(r.type).toBe('UNKNOWN');
    expect(r.category).toBe('PROMOTIONAL');
    expect(r.confidence).toBeLessThan(0.5);
    expect(r.band).toBe('Needs review');
  });

  it('shows a merchant payment as money sent, to a shop', () => {
    const r = parseMessage(TZ.mixxLipaMerchant);
    expect(r.type).toBe('SENT');
    expect(r.details).toMatchObject({ kind: 'MERCHANT_PAYMENT', merchantNumber: '**** 4567' });
    expect(r.fields.find((f) => f.key === 'category')?.display).toBe('Merchant payment - Sent');
  });

  it('leaves banks, LUKU receipts and the demo samples to the general rules', () => {
    expect(parseMessage(TZ.lukuReceipt).parserId).toMatch(/GenericParser/);
    for (const s of SAMPLES.filter((x) => !['s5', 's6'].includes(x.id))) {
      expect(parseMessage(s.text, { sender: s.sender }).parserId).toMatch(/GenericParser/);
    }
  });

  describe('saving', () => {
    let db: SqlDatabase;
    beforeEach(async () => {
      db = await createMigratedDatabase();
      await useAppStore.getState().initialize({ database: db, now: () => '2026-09-14T08:00:00Z' });
    });
    afterEach(() => db.closeAsync());

    it('keeps a message it cannot trust for review, never dropping it (§43)', async () => {
      const out = await useAppStore.getState().analyzeAndSave(PROMO, 'M-PESA');
      expect(out.saved && out.transaction.status).toBe('NEEDS_REVIEW');
    });
  });
});
