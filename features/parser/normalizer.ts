/**
 * Stage 1 of the pipeline: make a message predictable to match against without
 * ever losing what the user actually pasted.
 *
 * Ported from `normalize()` in the design canvas.
 */

/**
 * Unicode spaces that turn up in real SMS. Left alone they break `\s`
 * assumptions and split amounts from their currency symbol.
 *
 * Listed as codepoints rather than literal characters so nothing invisible
 * lives in this file — an editor or a copy-paste can silently mangle those.
 */
const UNICODE_SPACE_CODEPOINTS = [
  0x00a0, // no-break space
  0x2000, // en quad
  0x2001, // em quad
  0x2002, // en space
  0x2003, // em space
  0x2004, // three-per-em space
  0x2005, // four-per-em space
  0x2006, // six-per-em space
  0x2007, // figure space
  0x2008, // punctuation space
  0x2009, // thin space
  0x200a, // hair space
  0x202f, // narrow no-break space
  0x3000, // ideographic space
];

const UNICODE_SPACES = new RegExp(
  `[${UNICODE_SPACE_CODEPOINTS.map((c) => String.fromCodePoint(c)).join('')}]`,
  'g',
);

export interface NormalizedSms {
  /** Exactly what was pasted. Never modified. */
  originalText: string;
  /** Whitespace-normalized text that the rules run against. */
  normalizedText: string;
  sender?: string;
  /** ISO timestamp of when the app received it (not when it was sent). */
  receivedAt?: string;
}

/**
 * Collapse whitespace without touching characters that carry meaning.
 *
 * Deliberately NOT done here: lower-casing (counterparty extraction relies on
 * capitalization) and punctuation stripping (references and amounts need it).
 */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(UNICODE_SPACES, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export interface NormalizeOptions {
  sender?: string;
  receivedAt?: string;
}

/** Build a `NormalizedSms`, preserving the original text alongside. */
export function normalize(raw: string, options: NormalizeOptions = {}): NormalizedSms {
  return {
    originalText: raw,
    normalizedText: normalizeText(raw),
    sender: options.sender,
    receivedAt: options.receivedAt,
  };
}

/**
 * Explains what normalization did, for the "How we got this" view.
 * Mirrors `normNote` in the canvas.
 */
export function normalizationNote(sms: NormalizedSms): string {
  return sms.normalizedText.length === sms.originalText.trim().length
    ? 'Whitespace already clean.'
    : 'Collapsed whitespace and blank lines.';
}
