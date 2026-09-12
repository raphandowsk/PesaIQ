import { DEMO_RECORDS } from '../features/transactions/demoData';
import { maskIdentifiersInText, maskNumber } from '../utils/privacy';

describe('maskNumber', () => {
  it.each([
    ['0712345678', '07** *** 678'],
    ['+255712345678', '+255 7** *** 678'],
    ['255712345678', '+255 7** *** 678'],
    ['4111111111111111', '**** 1111'],
    ['015200123456', '**** 3456'],
  ])('%p -> %p', (raw, masked) => {
    expect(maskNumber(raw)).toBe(masked);
  });
});

describe('maskIdentifiersInText', () => {
  it('masks a phone number inside a message, matching the record’s own mask', () => {
    const received = DEMO_RECORDS[0];
    const masked = maskIdentifiersInText(received.messageText);
    expect(masked).not.toContain('0712345678');
    expect(masked).toContain(received.transaction.maskedAccountOrPhone!);
  });

  it('leaves amounts, references and already-masked accounts alone', () => {
    const text =
      'Acct ****4312 debited TZS 1,200,000.00 on 05/03/26 at 07:15. Ref: QH42T8LM9P. TxnID BK7741902.';
    expect(maskIdentifiersInText(text)).toBe(text);
  });

  it('never leaves a full phone number in any demo message', () => {
    for (const r of DEMO_RECORDS) {
      expect(maskIdentifiersInText(r.messageText)).not.toMatch(/\d{9,}/);
    }
  });

  it('masks every number, not just the first', () => {
    expect(maskIdentifiersInText('from 0712345678 to 0687776887')).toBe(
      'from 07** *** 678 to 06** *** 887',
    );
  });
});
