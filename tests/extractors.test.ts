import {
  extractAmount,
  extractBalance,
  extractCounterparty,
  extractDate,
  extractMaskedIdentifier,
  extractReference,
} from '../features/parser/extractors';

describe('extractAmount', () => {
  it('reads an amount stated with TZS before the number', () => {
    const r = extractAmount('You have received TZS 250,000.00 from JOHN');
    expect(r.value).toBe(250000);
    expect(r.confidence).toBe(0.97);
    expect(r.warning).toBeUndefined();
  });

  it('reads an amount stated with the currency after the number', () => {
    expect(extractAmount('Amount 45,000 TZS sent').value).toBe(45000);
  });

  it('accepts TSH as well as TZS', () => {
    expect(extractAmount('Paid TSH 12,500').value).toBe(12500);
  });

  it('keeps decimal precision', () => {
    expect(extractAmount('TZS 1,234.56 received').value).toBe(1234.56);
  });

  it('falls back to a bare number at low confidence, with a warning', () => {
    const r = extractAmount('Umenunua muda wa maongezi 5000. Asante.');
    expect(r.value).toBe(5000);
    expect(r.confidence).toBe(0.55);
    expect(r.warning).toMatch(/currency not stated/);
  });

  it('warns and returns null when there is no amount at all', () => {
    const r = extractAmount('Karibu! Bofya kujiunga.');
    expect(r.value).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.warning).toMatch(/cannot be saved as a verified record/);
  });
});

describe('extractBalance', () => {
  it.each([
    ['New balance TZS 812,400.00.', 812400],
    ['Avail bal TZS 2,415,300.00.', 2415300],
    ['Available balance 500,000', 500000],
    ['Salio TZS 133,900.', 133900],
  ])('reads balance from %s', (text, expected) => {
    const r = extractBalance(text);
    expect(r.value).toBe(expected);
    expect(r.confidence).toBe(0.9);
  });

  it('returns null when no balance is reported', () => {
    expect(extractBalance('You have received TZS 250,000').value).toBeNull();
  });
});

describe('extractReference', () => {
  it.each([
    ['Ref: QH42T8LM9P.', 'QH42T8LM9P'],
    ['TxnID BK7741902.', 'BK7741902'],
    ['Muamala 8FR2K1DD.', '8FR2K1DD'],
    ['Receipt ABC123456', 'ABC123456'],
    ['Transaction ID: XY9988776', 'XY9988776'],
  ])('reads a reference from %s', (text, expected) => {
    const r = extractReference(text);
    expect(r.value).toBe(expected);
    expect(r.confidence).toBe(0.93);
  });

  it('ignores tokens shorter than six characters', () => {
    expect(extractReference('Ref: AB12').value).toBeNull();
  });

  it('warns about duplicate detection when missing', () => {
    const r = extractReference('You have received TZS 250,000');
    expect(r.value).toBeNull();
    expect(r.warning).toMatch(/only the exact same message is caught/);
  });
});

describe('extractCounterparty', () => {
  it('reads a "from" name at high confidence', () => {
    const r = extractCounterparty(
      'You have received TZS 250,000.00 from JOHN MWAKASEGE 0712345678',
    );
    expect(r.value).toBe('JOHN MWAKASEGE');
    expect(r.confidence).toBe(0.9);
  });

  it('reads a Swahili "kwa" name', () => {
    const r = extractCounterparty('Umetuma TZS 45,000 kwa GRACE KIMARO 0687776887.');
    expect(r.value).toBe('GRACE KIMARO');
    expect(r.confidence).toBe(0.88);
  });

  it('reads a payee at lower confidence', () => {
    const r = extractCounterparty('Umelipa TZS 38,500 LUKU TOKEN.');
    expect(r.value).toBe('LUKU TOKEN');
    expect(r.confidence).toBe(0.76);
  });

  it('falls back to ATM withdrawal at the lowest confidence', () => {
    const r = extractCounterparty('Acct ****4312 debited TZS 120,000.00 ATM withdrawal 11/03/26');
    expect(r.value).toBe('ATM withdrawal');
    expect(r.confidence).toBe(0.62);
  });

  it('prefers the stronger pattern when several could match', () => {
    const r = extractCounterparty('Received TZS 10,000 from ALICE NDOSI, paid to BOB MSUYA.');
    expect(r.value).toBe('ALICE NDOSI');
    expect(r.confidence).toBe(0.9);
  });

  it('matches the leading verb whatever its case', () => {
    // Real messages open with a capitalised verb; the canvas pattern was
    // lower-case only and silently dropped the counterparty.
    expect(extractCounterparty('Umelipa TZS 38,500 LUKU TOKEN.').value).toBe('LUKU TOKEN');
    expect(extractCounterparty('Kwa GRACE KIMARO 0687776887.').value).toBe('GRACE KIMARO');
    expect(extractCounterparty('From JOHN MWAKASEGE 0712345678').value).toBe('JOHN MWAKASEGE');
  });

  it('still requires an upper-case name, so prose is not captured', () => {
    expect(extractCounterparty('paid to the shop on the corner.').value).toBeNull();
  });

  it('returns null when no counterparty is present', () => {
    expect(extractCounterparty('Karibu! Bonasi ya 20%.').value).toBeNull();
  });
});

describe('extractMaskedIdentifier', () => {
  it('masks a phone number, keeping only the first two and last three digits', () => {
    const r = extractMaskedIdentifier('from JOHN MWAKASEGE 0712345678 on 12/03/26');
    expect(r.value).toBe('07** *** 678');
    expect(r.confidence).toBe(0.82);
  });

  it('never returns the full phone number', () => {
    expect(extractMaskedIdentifier('0712345678').value).not.toContain('0712345678');
  });

  it('masks an account number to its last four digits', () => {
    expect(extractMaskedIdentifier('Acct ****4312 debited').value).toBe('**** 4312');
  });

  it('returns null when there is no identifier', () => {
    expect(extractMaskedIdentifier('You have received TZS 250,000').value).toBeNull();
  });
});

describe('extractDate', () => {
  it('reads a day-first date and reformats it', () => {
    const r = extractDate('on 12/03/26 at 14:22.');
    expect(r.date).toBe('12 Mar 2026');
    expect(r.time).toBe('14:22');
    expect(r.confidence).toBe(0.88);
  });

  it('pads a single-digit day', () => {
    expect(extractDate('on 5/07/26').date).toBe('05 Jul 2026');
  });

  it('rejects a date that cannot exist rather than inventing one', () => {
    for (const text of [
      'on 12/99/26',
      'on 31/02/26',
      'on 00/05/26',
      'on 29/02/25',
      'on 12/03/026',
    ]) {
      const r = extractDate(text);
      expect(r.date).toBeNull();
      expect(r.confidence).toBe(0);
      expect(r.warning).toMatch(/not a real date/);
    }
  });

  it('accepts 29 February in a leap year', () => {
    expect(extractDate('on 29/02/28').date).toBe('29 Feb 2028');
  });

  it('keeps a four-digit year as written', () => {
    expect(extractDate('on 12/03/2026').date).toBe('12 Mar 2026');
    expect(extractDate('on 12/03/1999').date).toBe('12 Mar 1999');
  });

  it('skips an impossible date to find a real one', () => {
    expect(extractDate('code 45/99/26 on 12/03/26').date).toBe('12 Mar 2026');
  });

  it('drops a clock reading that cannot exist', () => {
    expect(extractDate('at 25:61').time).toBeNull();
    expect(extractDate('at 99:99 then 14:22').time).toBe('14:22');
    expect(extractDate('at 00:00').time).toBe('00:00');
  });

  it('returns the time even when there is no date', () => {
    const r = extractDate('at 09:07 today');
    expect(r.date).toBeNull();
    expect(r.time).toBe('09:07');
    expect(r.warning).toMatch(/capture time will be used/);
  });

  it('warns when neither date nor time is present', () => {
    const r = extractDate('You have received TZS 250,000');
    expect(r.date).toBeNull();
    expect(r.time).toBeNull();
    expect(r.confidence).toBe(0);
  });
});
