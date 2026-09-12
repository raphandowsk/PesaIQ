/**
 * Who the money went to, and the second reference, in the layouts real Mixx
 * messages use. Built from messages the user supplied (anonymized in
 * tests/fixtures/tz-messages.ts):
 *
 * - "kwenda kwa Vodacom LIPA NAME-12345678": a merchant's Lipa number
 * - "kwenda kwa Vodacom NAME-2557XXXXXXXX": a person on another network
 * - "kwenda kwa mpokeaji wa Halo Pesa NAME - 2556XXXXXXXX": the same, Mixx's
 *   other wording
 * - "Malipo yamekamilika kwenda NAME, Kiasi ...": a payment to a business
 */

export interface Recipient {
  name: string;
  /** The network the money went to, when the message names one. */
  network: string | null;
  /** A merchant (Lipa number, named business) rather than a person. */
  merchant: boolean;
  /** The recipient's number, unmasked. Mask before it goes anywhere. */
  number: string | null;
}

const NETWORKS = String.raw`Vodacom|M-?Pesa|Airtel(?: Money)?|Halo ?Pesa|Mixx(?: by Yas)?|Tigo(?: ?Pesa)?|TTCL|T-?Pesa|Azam ?Pesa|Selcom|NMB|CRDB|NBC`;

// Names stay upper-case, the wallets' convention, so ordinary words are never
// captured. A name may itself contain " - " ("TOTALENERGIES - KUNDUCHI SERVICE
// STATION"); the lazy match runs on to the " - digits" that closes it.
const TRANSFER_TO = new RegExp(
  String.raw`[Kk]wenda kwa (?:mpokeaji wa )?(${NETWORKS})\s+(LIPA\s+)?([A-Z0-9][A-Z0-9 .&'/-]*?)\s*-\s*\+?(\d{5,12})\b`,
);
const PAID_TO = /[Mm]alipo yamekamilika kwenda\s+([A-Z0-9][A-Z0-9 .&'/-]*?)\s*,\s*[Kk]iasi\b/;

export function extractRecipient(text: string): Recipient | null {
  const t = TRANSFER_TO.exec(text);
  if (t) return { name: t[3].trim(), network: t[1], merchant: !!t[2], number: t[4] };

  const p = PAID_TO.exec(text);
  if (p) return { name: p[1].trim(), network: null, merchant: true, number: null };

  return null;
}

/** "Risiti: 503-ABCDE12345": a receipt number kept beside the main reference. */
export function extractReceiptNumber(text: string): string | null {
  return /\bRisiti\s*[:.]?\s*([A-Z0-9][A-Z0-9-]{5,})/i.exec(text)?.[1] ?? null;
}
