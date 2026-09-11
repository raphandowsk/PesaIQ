import { formatAmount, formatSignedAmount, formatTzs, initials, MINUS } from '../utils/format';

describe('formatAmount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1,000'],
    [250000, '250,000'],
    [1200000, '1,200,000'],
    [812400.5, '812,400.5'],
    [45000.25, '45,000.25'],
  ])('formats %p as %p', (value, expected) => {
    expect(formatAmount(value)).toBe(expected);
  });

  it('drops a zero fraction rather than printing .00', () => {
    expect(formatAmount(250000.0)).toBe('250,000');
  });

  it('rounds to two places', () => {
    expect(formatAmount(1.239)).toBe('1.24');
  });

  it('uses the typographic minus for negatives', () => {
    expect(formatAmount(-45000)).toBe(`${MINUS}45,000`);
  });

  it('never throws on a non-finite number', () => {
    expect(formatAmount(Number.NaN)).toBe('—');
    expect(formatAmount(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('formatSignedAmount', () => {
  it('signs by direction, not by the value', () => {
    expect(formatSignedAmount(250000, true)).toBe('+250,000');
    expect(formatSignedAmount(45000, false)).toBe(`${MINUS}45,000`);
    expect(formatSignedAmount(-45000, false)).toBe(`${MINUS}45,000`);
  });

  it('shows a dash when there is no amount', () => {
    expect(formatSignedAmount(null, true)).toBe('—');
  });
});

describe('formatTzs', () => {
  it('prefixes the currency', () => {
    expect(formatTzs(38500)).toBe('TZS 38,500');
    expect(formatTzs(null)).toBe('—');
  });
});

describe('initials', () => {
  it.each([
    ['JOHN M.', 'JM'],
    ['GRACE KIMARO', 'GK'],
    ['ATM withdrawal', 'AW'],
    ['PAYROLL BATCH ONE', 'PB'],
    ['luku', 'L'],
  ])('%p -> %p', (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  it('falls back when there are no letters to use', () => {
    expect(initials(null)).toBe('NA');
    expect(initials('')).toBe('NA');
    expect(initials('0712 345')).toBe('NA');
  });
});
