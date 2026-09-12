import {
  checkCharges,
  extractElectricityReceipt,
  extractFee,
  extractTaxes,
} from '../features/parser/charges';
import { maskIdentifier } from '../features/parser/extractors';
import { extractReceiptNumber, extractRecipient } from '../features/parser/recipient';
import type { TaxLine } from '../features/parser/schema';
import { TZ } from './fixtures/tz-messages';

const vat = (amount: number, within: TaxLine['within'] = 'fee'): TaxLine => ({
  code: 'VAT',
  amount,
  ratePct: null,
  within,
});

describe('extractFee', () => {
  it.each([
    ['Jumla ya makato TSh 1,440, VAT TSh 220.', 1440, 'Total charges'],
    ['Ada TSh 495. VAT TSh 76.', 495, 'Fee'],
    ['Ada Tsh 600. VAT TSh 92.', 600, 'Fee'],
    ['Ada ya kutoa TSh 1,500.', 1500, 'Withdrawal fee'],
    ['Transaction cost TZS 300.', 300, 'Fee'],
  ])('reads %s', (text, value, label) => {
    expect(extractFee(text)).toEqual({ value, label, confidence: 0.9 });
  });

  it('finds none when no fee is stated', () => {
    expect(extractFee('You have received TZS 250,000').value).toBeNull();
  });
});

describe('extractTaxes', () => {
  it('reads VAT as part of the fee when there is one', () => {
    expect(extractTaxes('Ada TSh 495. VAT TSh 76.', { hasFee: true, receipt: false })).toEqual([
      vat(76),
    ]);
  });

  it('reads every receipt line, with its rate, as part of the amount', () => {
    const taxes = extractTaxes(TZ.lukuReceipt, { hasFee: false, receipt: true });
    expect(taxes.map((t) => [t.code, t.amount, t.ratePct, t.within])).toEqual([
      ['VAT', 2729.5, 18, 'amount'],
      ['EWURA', 151.64, 1, 'amount'],
      ['REA', 454.92, 3, 'amount'],
    ]);
  });

  it('reads excise duty and the government levy', () => {
    const taxes = extractTaxes('Excise duty TZS 30. Tozo TSh 50.', {
      hasFee: false,
      receipt: false,
    });
    expect(taxes.map((t) => [t.code, t.amount])).toEqual([
      ['EXCISE', 30],
      ['LEVY', 50],
    ]);
  });

  it('does not mistake words containing the acronyms for taxes', () => {
    expect(extractTaxes('ANDREA paid AREA 5000', { hasFee: false, receipt: false })).toEqual([]);
  });
});

describe('checkCharges', () => {
  it('confirms VAT already inside the fee', () => {
    const r = checkCharges({ fee: 450, taxes: [vat(69)], receipt: null });
    expect(r.reasons).toContain('VAT is 18% of the fee, already included in it');
    expect(r.taxes).toEqual([vat(69)]);
    expect(r.taxConfidence).toBe(0.9);
  });

  it('moves VAT charged on top of the fee outside it', () => {
    const r = checkCharges({ fee: 1000, taxes: [vat(180)], receipt: null });
    expect(r.taxes).toEqual([vat(180, 'extra')]);
    expect(r.reasons).toContain('VAT is 18% charged on top of the fee');
  });

  it('warns, and lowers trust, when the VAT fits neither', () => {
    const r = checkCharges({ fee: 450, taxes: [vat(20)], receipt: null });
    expect(r.warnings).toEqual([
      'The VAT does not match 18% of the fee. Check the fee and the VAT.',
    ]);
    expect(r.taxConfidence).toBe(0.6);
  });

  it('warns when receipt lines do not add up to the total', () => {
    const receipt = extractElectricityReceipt(
      TZ.lukuReceipt.replace('TOTAL 20,000.00', 'TOTAL 21,000.00'),
    )!;
    const taxes = extractTaxes(TZ.lukuReceipt, { hasFee: false, receipt: true });
    const r = checkCharges({ fee: null, taxes, receipt });
    expect(r.warnings).toContain(
      'The receipt lines do not add up to the total. Check the amounts.',
    );
  });

  it('names a tax that does not match its stated rate', () => {
    const text = TZ.lukuReceipt.replace('REA 3% 454.92', 'REA 3% 400.00');
    const r = checkCharges({
      fee: null,
      taxes: extractTaxes(text, { hasFee: false, receipt: true }),
      receipt: extractElectricityReceipt(text),
    });
    expect(r.warnings).toContain('REA does not match its stated rate.');
  });
});

describe('extractElectricityReceipt', () => {
  it('is null for anything that is not a receipt', () => {
    expect(extractElectricityReceipt(TZ.mixxBetting)).toBeNull();
  });

  it('groups a token written as one run of 20 digits', () => {
    const text = TZ.lukuReceipt.replace('1111 2222 3333 4444 5555', '11112222333344445555');
    expect(extractElectricityReceipt(text)?.token).toBe('1111 2222 3333 4444 5555');
  });
});

describe('extractRecipient', () => {
  it.each([
    [
      TZ.mixxLipaMerchant,
      { name: 'ASHA JUMA MREMA', network: 'Vodacom', merchant: true, number: '51234567' },
    ],
    [
      TZ.mixxToPerson,
      { name: 'JUMA SAIDI HAMISI', network: 'Vodacom', merchant: false, number: '255700000123' },
    ],
    [
      TZ.mixxToOtherNetwork,
      { name: 'NEEMA ALLY OMARI', network: 'Halo Pesa', merchant: false, number: '255620000456' },
    ],
    [
      TZ.mixxLipaFuel,
      {
        name: 'TOTALENERGIES - KUNDUCHI SERVICE STATION',
        network: 'Vodacom',
        merchant: true,
        number: '60000789',
      },
    ],
    [TZ.mixxBetting, { name: 'HELABET', network: null, merchant: true, number: null }],
  ])('reads the recipient of %#', (text, expected) => {
    expect(extractRecipient(text)).toEqual(expected);
  });

  it('is null for other layouts', () => {
    expect(extractRecipient('Umetuma TZS 45,000 kwa GRACE KIMARO 0687776887.')).toBeNull();
  });
});

describe('extractReceiptNumber', () => {
  it('reads "Risiti"', () => {
    expect(extractReceiptNumber(TZ.mixxLipaMerchant)).toBe('503-TESTAB12CD');
    expect(extractReceiptNumber(TZ.mixxBetting)).toBeNull();
  });
});

describe('maskIdentifier', () => {
  it('shows an international number the same as its local form', () => {
    expect(maskIdentifier('255700000123')).toBe('07** *** 123');
    expect(maskIdentifier('0700000123')).toBe('07** *** 123');
  });

  it('keeps the last four digits of a till, meter or account number', () => {
    expect(maskIdentifier('51234567')).toBe('**** 4567');
    expect(maskIdentifier('14200000001')).toBe('**** 0001');
  });
});
