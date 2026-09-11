import { normalizationNote, normalize, normalizeText } from '../features/parser/normalizer';

describe('normalizeText', () => {
  it('converts CRLF and CR to LF', () => {
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('collapses runs of spaces and tabs', () => {
    expect(normalizeText('TZS    50,000\t\tsent')).toBe('TZS 50,000 sent');
  });

  it('folds unicode spaces to a plain space', () => {
    const nbsp = String.fromCodePoint(0x00a0);
    const emQuad = String.fromCodePoint(0x2001);
    const figure = String.fromCodePoint(0x2007);
    const narrow = String.fromCodePoint(0x202f);
    const ideographic = String.fromCodePoint(0x3000);

    expect(normalizeText(`TZS${nbsp}50,000`)).toBe('TZS 50,000');
    expect(normalizeText(`a${emQuad}b`)).toBe('a b');
    expect(normalizeText(`a${figure}b`)).toBe('a b');
    expect(normalizeText(`a${narrow}b`)).toBe('a b');
    expect(normalizeText(`a${ideographic}b`)).toBe('a b');
  });

  it('trims each line and drops blank ones', () => {
    expect(normalizeText('  line one  \n\n\n   line two   \n  ')).toBe('line one\nline two');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeText('   \n\t  \n ')).toBe('');
  });

  it('preserves case, punctuation and digits that rules depend on', () => {
    const input = 'Received TZS 250,000.00 from JOHN M. Ref: QH42T8LM9P.';
    expect(normalizeText(input)).toBe(input);
  });

  it('handles multipart-style messages joined across lines', () => {
    const input = 'You have received\nTZS 250,000.00\nfrom JOHN MWAKASEGE';
    expect(normalizeText(input)).toBe('You have received\nTZS 250,000.00\nfrom JOHN MWAKASEGE');
  });
});

describe('normalize', () => {
  it('never destroys the original text', () => {
    const raw = '  Umetuma   TZS 45,000  \n\n ';
    const sms = normalize(raw);

    expect(sms.originalText).toBe(raw);
    expect(sms.normalizedText).toBe('Umetuma TZS 45,000');
  });

  it('carries sender and receivedAt through untouched', () => {
    const sms = normalize('hello', { sender: 'DEMO-BANK', receivedAt: '2026-09-11T10:00:00Z' });
    expect(sms.sender).toBe('DEMO-BANK');
    expect(sms.receivedAt).toBe('2026-09-11T10:00:00Z');
  });

  it('leaves sender undefined when not supplied', () => {
    expect(normalize('hello').sender).toBeUndefined();
  });
});

describe('normalizationNote', () => {
  it('reports clean input as already clean', () => {
    expect(normalizationNote(normalize('TZS 50,000 sent'))).toBe('Whitespace already clean.');
  });

  it('reports collapsed input', () => {
    expect(normalizationNote(normalize('TZS    50,000\n\n\nsent'))).toBe(
      'Collapsed whitespace and blank lines.',
    );
  });
});
