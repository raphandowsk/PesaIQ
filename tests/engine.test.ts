import {
  EmptyMessageError,
  MessageTooLongError,
  formatAmount,
  parseMessage,
} from '../features/parser/engine';
import { SAMPLES } from '../features/parser/samples';
import { validateParseResult } from '../features/parser/schema';

const sample = (id: string) => {
  const s = SAMPLES.find((x) => x.id === id);
  if (!s) throw new Error(`missing sample ${id}`);
  return s;
};

describe('demo samples are safe to ship', () => {
  it('marks every sample as anonymized demo data', () => {
    for (const s of SAMPLES) {
      expect(s.text).toContain('DEMO SAMPLE (anonymized)');
    }
  });

  it('has four samples covering received, sent, bank and unknown', () => {
    expect(SAMPLES.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
  });
});

describe('parseMessage - mobile money received (s1)', () => {
  const s = sample('s1');
  const r = parseMessage(s.text, { sender: s.sender });

  it('classifies it as an incoming payment', () => {
    expect(r.category).toBe('PAYMENT_RECEIVED');
    expect(r.type).toBe('RECEIVED');
  });

  it('extracts every field', () => {
    expect(r.amount).toBe(250000);
    expect(r.currency).toBe('TZS');
    expect(r.counterparty).toBe('JOHN MWAKASEGE');
    expect(r.transactionReference).toBe('QH42T8LM9P');
    expect(r.balanceAfter).toBe(812400);
    expect(r.transactionDate).toBe('12 Mar 2026');
    expect(r.transactionTime).toBe('14:22');
  });

  it('masks the phone number in every structured field', () => {
    expect(r.maskedAccountOrPhone).toBe('07** *** 678');

    // The source text is retained deliberately (see docs/PRIVACY.md) and still
    // holds the raw number. What must never carry it is the structured output,
    // which is what gets exported, logged and shown.
    const structured = { ...r, originalText: '', normalizedText: '' };
    expect(JSON.stringify(structured)).not.toContain('0712345678');
  });

  it('recognizes the provider and says the parser is DEMO', () => {
    expect(r.provider).toBe('Wallet A (M-Pesa-like demo)');
    expect(r.parserId).toContain('DEMO');
  });

  it('scores it confidently with no warnings', () => {
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
    expect(r.band).toBe('Very high');
    expect(r.warnings).toEqual([]);
  });

  it('produces a result the schema accepts', () => {
    expect(validateParseResult(r).ok).toBe(true);
  });
});

describe('parseMessage - Swahili sent (s2)', () => {
  const s = sample('s2');
  const r = parseMessage(s.text, { sender: s.sender });

  it('understands Swahili wording', () => {
    expect(r.category).toBe('PAYMENT_SENT');
    expect(r.type).toBe('SENT');
    expect(r.amount).toBe(45000);
    expect(r.counterparty).toBe('GRACE KIMARO');
    expect(r.transactionReference).toBe('8FR2K1DD');
    expect(r.balanceAfter).toBe(133900);
  });

  it('masks the phone number', () => {
    expect(r.maskedAccountOrPhone).toBe('06** *** 887');
  });

  it('warns that the message carries no date', () => {
    expect(r.warnings.some((w) => /No date/.test(w))).toBe(true);
  });
});

describe('parseMessage - bank withdrawal (s3)', () => {
  const s = sample('s3');
  const r = parseMessage(s.text, { sender: s.sender });

  it('classifies it as a withdrawal', () => {
    expect(r.category).toBe('WITHDRAWAL');
    expect(r.type).toBe('WITHDRAWAL');
  });

  it('extracts the amount, reference, balance and date', () => {
    expect(r.amount).toBe(120000);
    expect(r.transactionReference).toBe('BK7741902');
    expect(r.balanceAfter).toBe(2415300);
    expect(r.transactionDate).toBe('11 Mar 2026');
  });

  it('masks the account number in every structured field', () => {
    expect(r.maskedAccountOrPhone).toBe('**** 4312');

    const structured = { ...r, originalText: '', normalizedText: '' };
    expect(JSON.stringify(structured)).not.toContain('4312 debited');
  });

  it('falls back to ATM withdrawal as a low-confidence counterparty', () => {
    expect(r.counterparty).toBe('ATM withdrawal');
    const field = r.fields.find((f) => f.key === 'counterparty');
    expect(field?.low).toBe(true);
  });
});

describe('parseMessage - promotional (s4)', () => {
  const s = sample('s4');
  const r = parseMessage(s.text, { sender: s.sender });

  it('classifies it as promotional, not a transaction', () => {
    expect(r.category).toBe('PROMOTIONAL');
    expect(r.type).toBe('UNKNOWN');
  });

  it('is capped below the review threshold', () => {
    expect(r.confidence).toBeLessThan(0.6);
    expect(r.band).toBe('Needs review');
  });

  it('does not recognize a provider for an unknown sender', () => {
    expect(r.provider).toBeNull();
  });

  it('warns about the missing reference', () => {
    expect(r.warnings.some((w) => /reference/.test(w))).toBe(true);
  });
});

describe('parseMessage - malformed input', () => {
  it('rejects an empty message', () => {
    expect(() => parseMessage('')).toThrow(EmptyMessageError);
    expect(() => parseMessage('    \n\t ')).toThrow(EmptyMessageError);
  });

  it('rejects an absurdly long message', () => {
    expect(() => parseMessage('x'.repeat(1601))).toThrow(MessageTooLongError);
  });

  it('accepts a message exactly at the limit', () => {
    expect(() => parseMessage('TZS 500 received '.padEnd(1600, '.'))).not.toThrow();
  });

  it('does not throw on an unknown format, it downgrades confidence', () => {
    const r = parseMessage('Hello, are we still meeting tomorrow?');
    expect(r.category).toBe('OTHER');
    expect(r.type).toBe('UNKNOWN');
    expect(r.band).toBe('Needs review');
  });

  it('handles a message with no amount', () => {
    const r = parseMessage('You have received a payment from JOHN DOE.');
    expect(r.amount).toBeNull();
    expect(r.warnings.some((w) => /No amount/.test(w))).toBe(true);
  });

  it('handles an amount with no currency at reduced confidence', () => {
    const r = parseMessage('Umenunua muda wa maongezi 5000. Asante.');
    expect(r.amount).toBe(5000);
    expect(r.warnings.some((w) => /currency not stated/.test(w))).toBe(true);

    const amountField = r.fields.find((f) => f.key === 'amount');
    expect(amountField?.low).toBe(true);
  });

  it('survives punctuation-only input', () => {
    const r = parseMessage('!!! ??? ...');
    expect(r.category).toBe('OTHER');
    expect(r.amount).toBeNull();
  });

  it('survives a message that is only an amount', () => {
    const r = parseMessage('TZS 1,000');
    expect(r.amount).toBe(1000);
    expect(r.category).toBe('OTHER');
  });
});

describe('parseMessage - determinism and duplicates', () => {
  it('returns identical output for identical input', () => {
    const s = sample('s1');
    expect(parseMessage(s.text, { sender: s.sender })).toEqual(
      parseMessage(s.text, { sender: s.sender }),
    );
  });

  it('gives a duplicate message the same reference, so it can be detected', () => {
    const s = sample('s1');
    const a = parseMessage(s.text, { sender: s.sender });
    const b = parseMessage(`  ${s.text}  `, { sender: s.sender });

    expect(a.transactionReference).toBe(b.transactionReference);
    expect(a.amount).toBe(b.amount);
  });
});

describe('parseMessage - result shape', () => {
  it('always preserves the original text alongside the normalized form', () => {
    const raw = '  Umetuma   TZS 45,000\n\n kwa GRACE KIMARO.  ';
    const r = parseMessage(raw);

    expect(r.originalText).toBe(raw);
    expect(r.normalizedText).toBe('Umetuma TZS 45,000\nkwa GRACE KIMARO.');
  });

  it('returns one field per extractable value, each with its own confidence', () => {
    const r = parseMessage(sample('s1').text);
    expect(r.fields.map((f) => f.key)).toEqual([
      'category',
      'provider',
      'amount',
      'counterparty',
      'masked',
      'reference',
      'balance',
      'date',
    ]);
    expect(r.fields.every((f) => f.confidence >= 0 && f.confidence <= 1)).toBe(true);
  });

  it('marks absent fields missing rather than low', () => {
    const r = parseMessage('Hello there');
    const balance = r.fields.find((f) => f.key === 'balance');
    expect(balance?.missing).toBe(true);
    expect(balance?.low).toBe(false);
  });

  it('explains its reasoning', () => {
    const r = parseMessage(sample('s1').text);
    expect(r.reasons.length).toBeGreaterThan(0);
    expect(r.factors).toHaveLength(7);
    expect(r.normalizationNote).toBeTruthy();
  });

  it('validates against the schema for every sample', () => {
    for (const s of SAMPLES) {
      const v = validateParseResult(parseMessage(s.text, { sender: s.sender }));
      expect(v.ok).toBe(true);
    }
  });
});

describe('validateParseResult', () => {
  it('rejects a malformed result with readable paths', () => {
    const v = validateParseResult({ category: 'NOT_A_CATEGORY', amount: 'lots' });
    expect(v.ok).toBe(false);
    expect(v.errors?.length).toBeGreaterThan(0);
  });

  it('rejects a confidence outside 0..1', () => {
    const good = parseMessage(sample('s1').text);
    expect(validateParseResult({ ...good, confidence: 1.5 }).ok).toBe(false);
  });
});

describe('formatAmount', () => {
  it('groups thousands', () => {
    expect(formatAmount(250000)).toBe('250,000');
    expect(formatAmount(1234.5)).toBe('1,234.5');
  });

  it('renders a dash for a missing amount', () => {
    expect(formatAmount(null)).toBe('-');
  });
});
