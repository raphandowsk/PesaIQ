import { classify } from '../features/parser/classifier';

describe('classify - English wording', () => {
  it('detects an incoming payment', () => {
    const r = classify('You have received TZS 250,000.00 from JOHN MWAKASEGE');
    expect(r.category).toBe('PAYMENT_RECEIVED');
    expect(r.reasons).toContain('Incoming-payment wording');
  });

  it('detects an outgoing payment', () => {
    expect(classify('You sent TZS 45,000 to GRACE').category).toBe('PAYMENT_SENT');
  });

  it('treats a debit as outgoing', () => {
    expect(classify('Acct ****4312 debited 120,000').category).toBe('PAYMENT_SENT');
  });

  it('detects a withdrawal', () => {
    expect(classify('ATM withdrawal of 120,000').category).toBe('WITHDRAWAL');
  });

  it('detects a deposit', () => {
    expect(classify('Cash deposit of 500,000 confirmed').category).toBe('DEPOSIT');
  });

  it('detects a bill payment', () => {
    expect(classify('You paid to LUKU TOKEN 38,500').category).toBe('BILL_PAYMENT');
  });

  it('detects an airtime purchase', () => {
    expect(classify('Airtime purchase of 5,000 successful').category).toBe('AIRTIME_PURCHASE');
  });

  it('detects a balance-only message', () => {
    expect(classify('Your balance is 812,400').category).toBe('BALANCE_UPDATE');
  });
});

describe('classify - Swahili wording', () => {
  // The UI is English but the messages are not. These must keep working.
  it.each([
    ['Umepokea TZS 250,000 kutoka JOHN', 'PAYMENT_RECEIVED'],
    ['Umetuma TZS 45,000 kwa GRACE KIMARO', 'PAYMENT_SENT'],
    ['Umetoa TZS 120,000', 'WITHDRAWAL'],
    ['Umeweka TZS 500,000', 'DEPOSIT'],
    ['Umelipa TZS 38,500 LUKU TOKEN', 'BILL_PAYMENT'],
    ['Umenunua muda wa maongezi 5000', 'AIRTIME_PURCHASE'],
    ['Salio lako ni TZS 133,900', 'BALANCE_UPDATE'],
  ])('classifies %s', (text, expected) => {
    expect(classify(text).category).toBe(expected);
  });
});

describe('classify - non-transactional messages', () => {
  it('detects an OTP and says why', () => {
    const r = classify('Your OTP is 123456. Do not share it with anyone.');
    expect(r.category).toBe('OTP');
    expect(r.reasons).toContain('One-time-code wording');
  });

  it('detects a Swahili OTP', () => {
    expect(classify('Namba yako ya siri ni 4821. Usitoe kwa mtu.').category).toBe('OTP');
  });

  it('detects promotional wording', () => {
    const r = classify('Karibu! Bonasi ya 20% kwa kila bando. Bofya *149*88# kujiunga.');
    expect(r.category).toBe('PROMOTIONAL');
    expect(r.reasons).toContain('No transaction verbs found');
  });

  it('does not misread a real transaction that mentions a bonus', () => {
    // The promo rule must yield when genuine transaction wording is present.
    const r = classify('Bonus applied. You have received TZS 10,000 sent from PROMO DESK');
    expect(r.category).not.toBe('PROMOTIONAL');
  });

  it('falls back to OTHER with an explanation', () => {
    const r = classify('Hello, are we meeting tomorrow?');
    expect(r.category).toBe('OTHER');
    expect(r.confidence).toBe(0.4);
    expect(r.reasons).toContain('No known transaction wording matched');
  });
});

describe('classify - ordering', () => {
  it('checks OTP before transaction verbs', () => {
    // Contains "received" but is plainly a code message.
    expect(classify('Your one-time code was received: 8823').category).toBe('OTP');
  });
});

describe('classify - confidence adjustments', () => {
  it('boosts confidence when TZS is present', () => {
    const withCurrency = classify('You have received TZS 250,000');
    const without = classify('You have received 250,000');

    expect(without.confidence).toBeCloseTo(0.92, 5);
    expect(withCurrency.confidence).toBeCloseTo(0.95, 5);
    expect(withCurrency.reasons).toContain('TZS amount present');
  });

  it('caps the boosted confidence at 0.97', () => {
    expect(classify('You have received TZS 1').confidence).toBeLessThanOrEqual(0.97);
  });

  it('notes a reference token without changing confidence', () => {
    const withRef = classify('You have received TZS 100 Ref: ABC123');
    const withoutRef = classify('You have received TZS 100');

    expect(withRef.reasons).toContain('Reference-like token present');
    expect(withRef.confidence).toBeCloseTo(withoutRef.confidence, 5);
  });

  it('recognizes muamala as a reference token', () => {
    expect(classify('Umetuma TZS 45,000. Muamala 8FR2K1DD').reasons).toContain(
      'Reference-like token present',
    );
  });
});
