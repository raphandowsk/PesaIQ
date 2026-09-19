import { parseMessage } from '../features/parser/engine';
import { TZ } from './fixtures/tz-messages';

const VAT_INSIDE_FEE = 'VAT is 18% of the fee, already included in it';

describe('real Mixx layouts', () => {
  it.each([
    [
      'a Lipa merchant payment',
      TZ.mixxLipaMerchant,
      {
        type: 'SENT',
        amount: 5000,
        fee: 450,
        vat: 69,
        counterparty: 'ASHA JUMA MREMA',
        network: 'Vodacom',
        merchant: true,
        masked: '**** 4567',
        reference: '26700000000001',
        receipt: '503-TESTAB12CD',
        balance: 120550,
        time: '16:00',
        category: 'FOOD_SHOPPING',
      },
    ],
    [
      'money sent to a person',
      TZ.mixxToPerson,
      {
        type: 'SENT',
        amount: 110357,
        fee: 1440,
        vat: 220,
        counterparty: 'JUMA SAIDI HAMISI',
        network: 'Vodacom',
        merchant: false,
        masked: '07** *** 123',
        reference: '26100000000003',
        receipt: '503-TESTCD34EF',
        balance: 126000,
        time: '15:45',
        category: 'SENT_TO_PEOPLE',
      },
    ],
    [
      'money sent to another network',
      TZ.mixxToOtherNetwork,
      {
        type: 'SENT',
        amount: 10000,
        fee: 495,
        vat: 76,
        counterparty: 'NEEMA ALLY OMARI',
        network: 'Halo Pesa',
        merchant: false,
        masked: '06** *** 456',
        reference: '26700000000004',
        receipt: null,
        balance: 243000,
        time: '14:25',
        category: 'SENT_TO_PEOPLE',
      },
    ],
    [
      'a fuel station on a Lipa number',
      TZ.mixxLipaFuel,
      {
        type: 'SENT',
        amount: 15000,
        fee: 1000,
        vat: 153,
        counterparty: 'TOTALENERGIES - KUNDUCHI SERVICE STATION',
        network: 'Vodacom',
        merchant: true,
        masked: '**** 0789',
        reference: '26600000000006',
        receipt: null,
        balance: 5000,
        time: '13:18',
        category: 'FUEL_TRANSPORT',
      },
    ],
    [
      'a payment to a business',
      TZ.mixxBetting,
      {
        type: 'BILL_PAYMENT',
        amount: 32000,
        fee: 600,
        vat: 92,
        counterparty: 'HELABET',
        network: null,
        merchant: true,
        masked: null,
        reference: '26200000000002',
        receipt: null,
        balance: 210400,
        time: '15:40',
        category: 'BETTING',
      },
    ],
  ])('reads %s', (_, text, e) => {
    const r = parseMessage(text);

    expect(r.provider).toBe('Mixx by Yas');
    expect(r.providerId).toBe('mixx');
    expect(r.parserId).toMatch(/Mixx rules \(EXPERIMENTAL\)/);
    expect(r.type).toBe(e.type);
    expect(r.amount).toBe(e.amount);
    expect(r.fee).toBe(e.fee);
    expect(r.taxes).toEqual([{ code: 'VAT', amount: e.vat, ratePct: null, within: 'fee' }]);
    expect(r.counterparty).toBe(e.counterparty);
    expect(r.details.network).toBe(e.network);
    expect(r.details.merchant).toBe(e.merchant);
    expect(r.maskedAccountOrPhone).toBe(e.masked);
    expect(r.transactionReference).toBe(e.reference);
    expect(r.details.receipt).toBe(e.receipt);
    expect(r.balanceAfter).toBe(e.balance);
    expect(r.transactionDate).toBe('12 Sep 2026');
    expect(r.transactionTime).toBe(e.time);
    expect(r.moneyCategory).toBe(e.category);
    expect(r.warnings).toEqual([]);
    expect(r.reasons).toContain(VAT_INSIDE_FEE);
    expect(r.band).toBe('Very high');
  });

  it('never carries a full phone or Lipa number in the record', () => {
    for (const text of Object.values(TZ)) {
      const r = parseMessage(text);
      expect(r.maskedAccountOrPhone ?? '').not.toMatch(/\d{5,}/);
    }
  });
});

describe('a LUKU receipt', () => {
  const r = parseMessage(TZ.lukuReceipt);

  it('reads the total as the amount, not a group of the token', () => {
    expect(r.type).toBe('BILL_PAYMENT');
    expect(r.amount).toBe(20000);
    expect(r.currency).toBe('TZS');
    expect(r.fee).toBeNull();
  });

  it('keeps each tax line, inside the amount paid, with its rate', () => {
    expect(r.taxes).toEqual([
      { code: 'VAT', amount: 2729.5, ratePct: 18, within: 'amount' },
      { code: 'EWURA', amount: 151.64, ratePct: 1, within: 'amount' },
      { code: 'REA', amount: 454.92, ratePct: 3, within: 'amount' },
    ]);
    expect(r.reasons).toEqual(
      expect.arrayContaining([
        'Receipt lines add up to the total',
        'Each tax matches its stated rate',
      ]),
    );
    expect(r.warnings).toEqual([]);
  });

  it('keeps units, meter, token, price and debt', () => {
    expect(r.details).toMatchObject({
      units: '51.9 kWh',
      meterNumber: '**** 0001',
      token: '1111 2222 3333 4444 5555',
      netCost: 15163.94,
      debtCollected: 1500,
    });
    expect(r.transactionReference).toBe('9000000000000000001');
    expect(r.maskedAccountOrPhone).toBe('**** 0001');
    expect(r.counterparty).toBe('LUKU electricity');
    expect(r.moneyCategory).toBe('ELECTRICITY_WATER');
    expect(r.transactionDate).toBe('12 Sep 2026');
    expect(r.transactionTime).toBe('08:16');
  });

  it('shows only the last four digits of the token among its fields', () => {
    expect(r.fields.find((f) => f.key === 'token')?.display).toBe('Hidden · ends 5555');
    expect(JSON.stringify(r.fields)).not.toContain('1111 2222');
  });

  it('leaves the sender unrecognized rather than guessing it', () => {
    expect(r.provider).toBeNull();
    expect(r.confidence).toBeGreaterThan(0.9);
  });
});

describe('a Mixx cash-out at an agent', () => {
  const r = parseMessage(TZ.mixxCashOut);

  it('reads a cash withdrawal to the named agent, not money sent to a person', () => {
    expect(r.type).toBe('WITHDRAWAL');
    expect(r.moneyCategory).toBe('CASH_WITHDRAWAL');
    expect(r.counterparty).toBe('BARAKA AGENCIES');
    expect(r.amount).toBe(15000);
    expect(r.transactionReference).toBe('26700000000021');
  });

  it('keeps the total charges, with the VAT and the Tozo levy inside them', () => {
    expect(r.fee).toBe(1645);
    expect(r.taxes).toEqual([
      { code: 'VAT', amount: 221, ratePct: null, within: 'fee' },
      { code: 'LEVY', amount: 195, ratePct: null, within: 'fee' },
    ]);
    // The VAT is 18% of the fee (Ada) alone, not of the total with the levy.
    expect(r.warnings).toEqual([]);
    expect(r.reasons).toContain(
      'VAT is 18% of the fee, already included in it; the levy is charged beside it',
    );
  });

  it('reads a larger withdrawal the same way', () => {
    const b = parseMessage(TZ.mixxCashOutLarge);
    expect(b.type).toBe('WITHDRAWAL');
    expect(b.counterparty).toBe('HALIMA JUMA');
    expect(b.fee).toBe(3273);
    expect(b.taxes.map((t) => [t.code, t.amount])).toEqual([
      ['VAT', 412],
      ['LEVY', 573],
    ]);
    expect(b.warnings).toEqual([]);
  });
});
