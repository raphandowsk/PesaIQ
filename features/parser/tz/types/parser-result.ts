import type { Operator } from './operator';
import type { ParsedTransaction } from './transaction';

/** What the phone hands the parser (§27). */
export interface SmsMessage {
  body: string;
  /** The sender ID or number, as the phone reports it. */
  sender?: string | null;
  receivedAt?: string | null;
}

/** The message after normalization: what every operator parser reads. */
export interface NormalizedSmsMessage {
  raw: string;
  /** Whitespace, dashes and invisible characters tidied; case kept. */
  text: string;
  senderRaw: string | null;
  /** Upper-case, single-spaced: "AIRTEL MONEY". */
  senderNormalized: string | null;
  receivedAt: string | null;
}

/** §36: one per operator. */
export interface SmsParser {
  operator: Operator;
  canParse(message: NormalizedSmsMessage): boolean;
  parse(message: NormalizedSmsMessage): ParsedTransaction | null;
}

/** §43: kept for review, never thrown away. */
export interface UnknownSms {
  classification: 'UNKNOWN';
  rawSms: string;
  senderId: string | null;
  receivedAt: string | null;
  parserVersion: string;
  /** The closest reading, when an operator was suspected. */
  closest: { operator: Operator; confidence: number } | null;
}

export type TzParseOutcome =
  | { kind: 'transaction'; transaction: ParsedTransaction }
  | { kind: 'unknown'; unknown: UnknownSms; closest: ParsedTransaction };
