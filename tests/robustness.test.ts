import type { SqlDatabase } from '../database/client';
import {
  EmptyMessageError,
  MAX_MESSAGE_LENGTH,
  MessageTooLongError,
  parseMessage,
  validateParseResult,
} from '../features/parser';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

/**
 * "Never crash on unexpected formats." Every input here is invented; the
 * point is shape, not realism. Whatever arrives, the parser must return a
 * well-formed result, keep numbers finite, keep identifiers masked and never
 * report a date that does not exist.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function expectSound(text: string) {
  const result = parseMessage(text, { sender: 'TEST' });

  const validation = validateParseResult(result);
  expect(validation.errors ?? []).toEqual([]);

  for (const n of [result.amount, result.balanceAfter]) {
    if (n !== null) expect(Number.isFinite(n)).toBe(true);
  }
  if (result.amount !== null) expect(result.amount).toBeGreaterThanOrEqual(0);

  // A masked value never carries a run of digits long enough to be a number.
  if (result.maskedAccountOrPhone) expect(result.maskedAccountOrPhone).not.toMatch(/\d{5,}/);

  if (result.transactionDate) {
    const m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(result.transactionDate);
    expect(m).not.toBeNull();
    const [, day, month, year] = m!;
    const d = new Date(Number(year), MONTHS.indexOf(month), Number(day));
    expect(d.getDate()).toBe(Number(day));
  }
  if (result.transactionTime) {
    const [h, min] = result.transactionTime.split(':').map(Number);
    expect(h).toBeLessThan(24);
    expect(min).toBeLessThan(60);
  }
  return result;
}

const HOSTILE: [string, string][] = [
  ['a currency with no amount', 'TZS'],
  ['a bare reference label', 'Ref:'],
  ['a single zero', '0'],
  ['a twenty-digit number', '12345678901234567890'],
  ['an absurd amount', 'Umepokea TZS 999,999,999,999,999,999.99'],
  ['a negative amount', 'Umepokea TZS -5,000 kutoka JOHN'],
  ['broken separators', 'You have received TZS 1,000.00.50,00 from JOHN'],
  ['an impossible date and time', 'Received TZS 5,000 on 31/02/26 at 25:61'],
  ['a nonsense date', 'Received TZS 5,000 on 99/99/99'],
  ['a zero date', 'Received TZS 5,000 on 00/00/00 at 00:00'],
  ['emoji everywhere', '🙂🙂 TZS 🙂 5,000 🙂 received'],
  ['right-to-left text', 'مرحبا TZS 5,000 تم الاستلام'],
  ['markup', '<script>alert(1)</script> Received TZS 5,000'],
  ['SQL', "'; DROP TABLE transactions; -- Received TZS 5,000"],
  ['control characters', String.fromCharCode(0x00, 0x07, 0x1b) + '[31m Received TZS 5,000'],
  ['amounts run together', 'Tsh5000Tsh6000Tsh7000'],
  ['another currency', 'USD 50 received from JOHN'],
  ['words where numbers go', 'Salio TZS NaN. Ref: undefined'],
  ['a huge reference', `Received TZS 5,000. Ref: ${'A'.repeat(500)}`],
  ['a long run of digits', `Muamala ${'9'.repeat(40)} TZS 5,000`],
  ['a very long name', `Received TZS 5,000 from ${'JOHN '.repeat(200)}`],
  [
    'invisible characters',
    String.fromCharCode(0x200b, 0x200b) +
      'TZS' +
      String.fromCharCode(0xa0) +
      '5,000' +
      String.fromCharCode(0x2028) +
      'received',
  ],
  ['full-width characters', 'ＴＺＳ' + String.fromCharCode(0x3000) + '５，０００ received'],
  ['a long account number', 'Account 1234567890123 debited TZS 5,000'],
  ['a spaced phone number', 'Umetuma TZS 45,000 kwa +255 712 345 678'],
  ['mixed line endings', 'Received\r\n\r\nTZS\r5,000\n\nRef\tAB12'],
  ['punctuation only', '.,.,;;::!!??'],
];

describe('the parser on hostile input', () => {
  it.each(HOSTILE)('stays sound with %s', (_, text) => {
    expectSound(text);
  });

  it('rejects empty input with its own error', () => {
    for (const text of ['', '   ', '\n\t\r\n']) {
      expect(() => parseMessage(text)).toThrow(EmptyMessageError);
    }
  });

  it('accepts the maximum length and rejects anything past it', () => {
    expect(() => expectSound('x'.repeat(MAX_MESSAGE_LENGTH))).not.toThrow();
    expect(() => parseMessage('x'.repeat(MAX_MESSAGE_LENGTH + 1))).toThrow(MessageTooLongError);
  });

  it('stays sound over 500 generated messages', () => {
    const TOKENS = [
      'You have received',
      'Umepokea',
      'Umetuma',
      'TZS',
      'Tsh',
      'TSh.',
      '5,000',
      '250,000.00',
      '1.000,50',
      '-',
      '+',
      'from',
      'kwa',
      'Ref:',
      'Muamala',
      'TxnID',
      'Salio',
      'balance',
      '12/03/26',
      '31/13/26',
      'at',
      '14:22',
      '99:99',
      '0712345678',
      '****4312',
      'JOHN',
      'GRACE',
      '🙂',
      '\n',
      '.',
      ',',
      ';',
      String.fromCharCode(0xa0),
      'ا',
      'Ｔ',
      'OTP',
      'code',
      'Bonasi',
      '%',
      '*149*88#',
    ];
    // A fixed-seed generator, so a failure always reproduces.
    let seed = 20260912;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };

    for (let i = 0; i < 500; i++) {
      const length = 1 + Math.floor(next() * 25);
      const words = Array.from({ length }, () => TOKENS[Math.floor(next() * TOKENS.length)]);
      const text = words.join(' ');
      if (!text.trim()) continue;
      try {
        expectSound(text);
      } catch (e) {
        throw new Error(`Generated message #${i} failed: ${JSON.stringify(text)}\n${String(e)}`);
      }
    }
  });
});

describe('saving hostile input', () => {
  let db: SqlDatabase;

  beforeEach(async () => {
    db = await createMigratedDatabase();
    await useAppStore
      .getState()
      .initialize({ database: db, now: () => '2026-09-12T08:00:00.000Z' });
  });
  afterEach(() => db.closeAsync());

  it('stores and reloads each one without losing or corrupting it', async () => {
    const app = useAppStore.getState;
    const before = app().transactions.length;

    for (const [, text] of HOSTILE) await app().analyzeAndSave(text, 'TEST');
    await app().initialize({ database: db, now: () => '2026-09-12T08:00:00.000Z' });

    expect(app().transactions).toHaveLength(before + HOSTILE.length);
    const sources = await Promise.all(
      app()
        .transactions.filter((t) => !t.isDemo)
        .map((t) => app().getRecordSource(t.sourceMessageId)),
    );
    expect(sources.map((s) => s?.text).sort()).toEqual(HOSTILE.map(([, t]) => t).sort());
  });
});
