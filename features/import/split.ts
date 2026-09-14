/**
 * One bulk paste, split into single messages.
 *
 * Messages are separated by blank lines (or a line of dashes), or follow one
 * another directly. A line that opens a message (an M-Pesa code, "Umepokea",
 * "Txn Id", "Utambulisho wa Muamala", …) starts a new one, but only once the
 * text before it already holds an amount. So a message that runs over several
 * lines ("R93NY448 Imethibitishwa" / "Umepokea Tsh505,000" / "kutoka kwa …")
 * stays whole.
 */

/** A paste larger than this is not 90 days of money messages. */
export const MAX_IMPORT_CHARS = 500_000;
/** Nor is one with more messages than this. */
export const MAX_IMPORT_MESSAGES = 3_000;

const OPENERS: readonly RegExp[] = [
  // M-Pesa: "R93NY448 Imethibitishwa", "M-PESA T54G0596 imethibitishwa", "Q55RT901 Confirmed."
  /^(?:M-?PESA:?\s+)?(?=[A-Z0-9]*\d)[A-Z0-9]{6,20}\s+(?:[Ii]methibitishwa|[Cc]onfirmed)\b/,
  // "M-PESA: …", "Airtel Money: …"
  /^(?:M-?PESA|Airtel\s*Money|Mixx(?:\s+by\s+Yas)?|Halo\s*Pesa|T-?PESA)\s*:/i,
  /^(?:Umepokea|Umetuma|Umelipa|Umelipia|Umetoa|Umenunua|Umewekewa|Umerudishiwa|Malipo\s+yamekamilika)\b/i,
  /^(?:Txn\s*Id|Utambulisho\s+wa\s+Muamala|You\s+have\s+received|Acct\b)/i,
];

/** An amount with its currency, or written "10,000/=". */
const HAS_AMOUNT = /(?:TZS|TSH|Tshs?)\.?\s*\d|\d\s*(?:TZS|Tshs?|TSH)\b|\d\s*\/[=-]/i;

const SEPARATOR = /^[-=_*~]{3,}$/;

export function splitMessages(paste: string): string[] {
  const messages: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) messages.push(current.join('\n'));
    current = [];
  };

  for (const raw of paste.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line || SEPARATOR.test(line)) {
      flush();
      continue;
    }
    if (
      current.length > 0 &&
      OPENERS.some((o) => o.test(line)) &&
      HAS_AMOUNT.test(current.join('\n'))
    ) {
      flush();
    }
    current.push(line);
  }
  flush();
  return messages;
}
