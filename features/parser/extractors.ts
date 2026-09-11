/**
 * Stage 3: pull structured fields out of the message.
 *
 * Ported from `runParse()` in the design canvas. Each extractor returns its own
 * confidence, so a record can be trusted field by field rather than wholesale —
 * a message can have a certain amount and a doubtful counterparty.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface Extracted<T> {
  value: T | null;
  confidence: number;
  /** Present when the value was read in a way the user should know about. */
  warning?: string;
}

/** Strip thousands separators before Number(). */
function toNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Amount, with currency where stated.
 *
 * Falls back to a bare 4-7 digit run at low confidence — enough to show the
 * user something, never enough to treat as verified.
 */
export function extractAmount(text: string): Extracted<number> {
  const withCurrency =
    /(?:TZS|TSH)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text) ??
    /([\d,]+(?:\.\d{1,2})?)\s*(?:TZS|TSH)/i.exec(text);

  if (withCurrency) {
    return { value: toNumber(withCurrency[1]), confidence: 0.97 };
  }

  const bare = /\b(\d{4,7})\b/.exec(text);
  if (bare) {
    return {
      value: toNumber(bare[1]),
      confidence: 0.55,
      warning: 'Amount read from a bare number, currency not stated.',
    };
  }

  return {
    value: null,
    confidence: 0,
    warning: 'No amount found - this cannot be saved as a verified record.',
  };
}

/** Balance after the transaction, if the message reports one. */
export function extractBalance(text: string): Extracted<number> {
  const m =
    /(?:new balance|avail(?:able)?\.?\s?bal(?:ance)?|salio)[^\d]{0,14}([\d,]+(?:\.\d{1,2})?)/i.exec(
      text,
    );
  return m ? { value: toNumber(m[1]), confidence: 0.9 } : { value: null, confidence: 0 };
}

/**
 * Transaction reference. Without one, duplicate detection is impossible, so a
 * missing reference is surfaced as a warning rather than passed over.
 */
export function extractReference(text: string): Extracted<string> {
  const m = /(?:ref|receipt|txn\s?id|txnid|muamala|transaction id)\s*[:.]?\s*([A-Z0-9]{6,})/i.exec(
    text,
  );
  return m
    ? { value: m[1], confidence: 0.93 }
    : {
        value: null,
        confidence: 0,
        warning: 'No transaction reference found - duplicates cannot be detected.',
      };
}

/**
 * Counterparty name. Ordered by how strongly the phrasing implies one:
 * "from X" is explicit, "to X" is weaker, a bare ATM is weakest.
 *
 * Runs against text that has NOT been lower-cased — these patterns rely on the
 * all-caps convention wallet messages use for names.
 */
export function extractCounterparty(text: string): Extracted<string> {
  // The leading verb allows either case because a message commonly opens with
  // it ("Umelipa ...", "From ..."). The captured name stays strictly
  // upper-case: the all-caps convention is what identifies it as a name, so
  // an /i/ flag here would start capturing ordinary lower-case words.
  const candidates: [RegExp, number][] = [
    [/\b[Ff]rom\s+([A-Z][A-Z .]{2,34}?)(?=\s+0\d|\s+on\b|,|\.|$)/, 0.9],
    [/\b[Kk]wa\s+([A-Z][A-Z .]{2,34}?)(?=\s+0\d|,|\.|$)/, 0.88],
    [
      /\b(?:[Pp]aid|[Uu]melipa|[Tt]o)\s+(?:TZS\s?[\d,.]+\s+)?([A-Z][A-Z .]{2,34}?)(?=\s+0\d|,|\.|$)/,
      0.76,
    ],
  ];

  for (const [pattern, confidence] of candidates) {
    const m = pattern.exec(text);
    if (m) return { value: m[1].trim(), confidence };
  }

  if (/\bATM withdrawal\b/i.test(text)) {
    return { value: 'ATM withdrawal', confidence: 0.62 };
  }

  return { value: null, confidence: 0 };
}

/**
 * Phone or account number, returned already masked.
 *
 * Masking happens at extraction, not at display: an unmasked identifier should
 * never exist downstream where it could be logged or exported by accident.
 */
export function extractMaskedIdentifier(text: string): Extracted<string> {
  const phone = /\b(0\d{9})\b/.exec(text);
  if (phone) {
    const digits = phone[1];
    return {
      value: `${digits.slice(0, 2)}** *** ${digits.slice(-3)}`,
      confidence: 0.82,
    };
  }

  const account = /\*{2,4}\s?(\d{4})\b/.exec(text);
  if (account) return { value: `**** ${account[1]}`, confidence: 0.82 };

  return { value: null, confidence: 0 };
}

export interface ExtractedDate {
  /** Display form, e.g. "12 Mar 2026". */
  date: string | null;
  /** 24h clock, e.g. "14:22". */
  time: string | null;
  confidence: number;
  warning?: string;
}

/**
 * Date and time. Assumes day-first (`dd/mm/yy`), which is the Tanzanian
 * convention; a US-style `mm/dd` message would be misread, and that is a known
 * Stage 1 limitation rather than an oversight.
 */
export function extractDate(text: string): ExtractedDate {
  const dateMatch = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(text);
  const timeMatch = /\b(\d{1,2}:\d{2})\b/.exec(text);
  const time = timeMatch ? timeMatch[1] : null;

  if (!dateMatch) {
    return {
      date: null,
      time,
      confidence: 0,
      warning: 'No date in the message - capture time will be used instead.',
    };
  }

  const day = String(dateMatch[1]).padStart(2, '0');
  const month = MONTHS[Number(dateMatch[2]) - 1] ?? '?';
  const year = `20${String(dateMatch[3]).slice(-2)}`;

  return { date: `${day} ${month} ${year}`, time, confidence: 0.88 };
}
