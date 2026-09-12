import { parseMessage } from '../features/parser/engine';
import {
  applyRememberedCategory,
  inferMoneyCategory,
  partyKey,
  type CategoryClues,
} from '../features/parser/moneyCategory';
import type { MoneyCategory } from '../types/domain';
import { TZ } from './fixtures/tz-messages';

describe('inferMoneyCategory', () => {
  const cases: [string, CategoryClues, MoneyCategory][] = [
    ['airtime', { type: 'AIRTIME', counterparty: null }, 'AIRTIME_DATA'],
    [
      'a cash withdrawal',
      { type: 'WITHDRAWAL', counterparty: 'ATM withdrawal' },
      'CASH_WITHDRAWAL',
    ],
    ['salary', { type: 'RECEIVED', counterparty: 'PAYROLL BATCH' }, 'SALARY'],
    ['money from a person', { type: 'RECEIVED', counterparty: 'JOHN M.' }, 'RECEIVED_FROM_PEOPLE'],
    ['a deposit', { type: 'DEPOSIT', counterparty: null }, 'OTHER_INCOME'],
    ['betting', { type: 'BILL_PAYMENT', counterparty: 'HELABET' }, 'BETTING'],
    [
      'fuel',
      { type: 'SENT', counterparty: 'TOTALENERGIES - KUNDUCHI SERVICE STATION', merchant: true },
      'FUEL_TRANSPORT',
    ],
    ['electricity', { type: 'BILL_PAYMENT', counterparty: 'LUKU TOKEN' }, 'ELECTRICITY_WATER'],
    [
      'a shop on a Lipa number',
      { type: 'SENT', counterparty: 'ASHA JUMA MREMA', merchant: true },
      'FOOD_SHOPPING',
    ],
    ['money sent to a person', { type: 'SENT', counterparty: 'GRACE K.' }, 'SENT_TO_PEOPLE'],
    ['an unnamed bill', { type: 'BILL_PAYMENT', counterparty: null }, 'BILLS_SERVICES'],
    ['an unnamed payment', { type: 'SENT', counterparty: null }, 'OTHER_SPENDING'],
  ];

  it.each(cases)('files %s', (_, clues, expected) => {
    expect(inferMoneyCategory(clues)).toBe(expected);
  });

  it('gives a message that is not a transaction no category', () => {
    expect(inferMoneyCategory({ type: 'UNKNOWN', counterparty: null })).toBeNull();
  });
});

describe('partyKey', () => {
  it('ignores case, spacing and punctuation', () => {
    expect(partyKey('Totalenergies -  Kunduchi')).toBe('TOTALENERGIES KUNDUCHI');
    expect(partyKey('TOTALENERGIES - KUNDUCHI')).toBe('TOTALENERGIES KUNDUCHI');
  });

  it('is null when there is no name', () => {
    expect(partyKey(null)).toBeNull();
    expect(partyKey(' - ')).toBeNull();
  });
});

describe('applyRememberedCategory', () => {
  const parsed = parseMessage(TZ.mixxBetting);

  it('uses the choice remembered for this recipient, and says so', () => {
    const r = applyRememberedCategory(parsed, { HELABET: 'OTHER_SPENDING' });
    expect(r.moneyCategory).toBe('OTHER_SPENDING');
    expect(r.reasons).toContain('Category remembered from your earlier choice for this recipient');
    expect(r.fields.find((f) => f.key === 'moneyCategory')).toMatchObject({
      value: 'OTHER_SPENDING',
      display: 'Other spending',
      confidence: 1,
    });
  });

  it('leaves the result untouched without a matching choice', () => {
    expect(applyRememberedCategory(parsed, { SOMEONE: 'SALARY' })).toBe(parsed);
    expect(applyRememberedCategory(parsed, { HELABET: 'BETTING' })).toBe(parsed);
  });
});
