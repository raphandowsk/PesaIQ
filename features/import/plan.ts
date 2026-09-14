/**
 * What happens to each message in the bulk import (decided 2026-09-14).
 *
 * - Money from the last 90 days is saved.
 * - A message with an amount but no date is saved for review: without a date
 *   it would land on today.
 * - A message the parser does not recognize is saved for review, never thrown
 *   away (spec §43), as long as it carries a number.
 * - Messages older than 90 days, promotions, balance notices, failed payments
 *   and repeats within the paste are left out.
 * - A one-time code is never stored (spec §46): its text is dropped here.
 */
import { MAX_MESSAGE_LENGTH, type ParseResult } from '../parser';
import { readWrittenDate } from '../transactions/records';
import { transactionKey } from '../transactions/transactionKey';
import type { MessageCategory } from '../../types/domain';

export const IMPORT_DAYS = 90;

export type ImportStatus = 'save' | 'review' | 'repeat' | 'old' | 'notMoney' | 'secret' | 'tooLong';

export interface ImportItem {
  id: string;
  /** The message. Empty for a one-time code or an over-long paste: not kept. */
  text: string;
  result: ParseResult | null;
  status: ImportStatus;
  /** Why, in a few words, for anything not simply saved. */
  note: string | null;
}

/** What the person can include or leave out; everything else is left out. */
export const SELECTABLE: readonly ImportStatus[] = ['save', 'review'];

const NOT_MONEY: Partial<Record<MessageCategory, string>> = {
  PROMOTIONAL: 'A promotion',
  BALANCE_UPDATE: 'A balance notice',
  SECURITY_ALERT: 'A security alert',
};

/** The first day that counts: 90 days before today, from midnight. */
export function importCutoff(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - IMPORT_DAYS);
}

export function classifyImport(
  result: ParseResult,
  cutoff: Date,
): { status: ImportStatus; note: string | null } {
  if (result.category === 'OTP') return { status: 'secret', note: 'A one-time code: never stored' };

  const said = result.details.messageStatus;
  if (said === 'FAILED') return { status: 'notMoney', note: 'Failed: no money moved' };
  if (said === 'PENDING') return { status: 'notMoney', note: 'Pending: no money moved yet' };

  if (result.type === 'UNKNOWN') {
    if (result.category !== 'OTHER') {
      return { status: 'notMoney', note: NOT_MONEY[result.category] ?? 'Not a money transaction' };
    }
    // Chat text, a date header: nothing a transaction could be read from.
    if (!/\d/.test(result.normalizedText)) {
      return { status: 'notMoney', note: 'No amount or number in it' };
    }
    return { status: 'review', note: 'Not recognized: saved for you to check' };
  }

  const when = readWrittenDate(result.transactionDate, result.transactionTime);
  if (!when) return { status: 'review', note: 'No date in the message: saved for you to check' };
  if (when < cutoff) return { status: 'old', note: `Older than ${IMPORT_DAYS} days` };
  return { status: 'save', note: null };
}

/**
 * One message of the paste. `seen` holds the transaction IDs already planned,
 * so the same transaction pasted twice is saved once.
 */
export function planOne(
  text: string,
  index: number,
  read: (text: string) => ParseResult,
  cutoff: Date,
  seen: Set<string>,
): ImportItem {
  const id = `m${index + 1}`;
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { id, text: '', result: null, status: 'tooLong', note: 'Too long to be one message' };
  }

  let result: ParseResult;
  try {
    result = read(text);
  } catch {
    return { id, text: '', result: null, status: 'notMoney', note: 'Could not be read' };
  }

  const { status, note } = classifyImport(result, cutoff);
  if (status === 'secret') return { id, text: '', result: null, status, note };

  if (status === 'save' || status === 'review') {
    const key = transactionKey(result, result.normalizedText);
    if (key && seen.has(key)) {
      return { id, text, result, status: 'repeat', note: 'Appears twice in what you pasted' };
    }
    if (key) seen.add(key);
  }
  return { id, text, result, status, note };
}

export function planImport(
  texts: readonly string[],
  read: (text: string) => ParseResult,
  now: Date,
): ImportItem[] {
  const cutoff = importCutoff(now);
  const seen = new Set<string>();
  return texts.map((text, i) => planOne(text, i, read, cutoff, seen));
}

export function countByStatus(items: readonly ImportItem[]): Record<ImportStatus, number> {
  const counts: Record<ImportStatus, number> = {
    save: 0,
    review: 0,
    repeat: 0,
    old: 0,
    notMoney: 0,
    secret: 0,
    tooLong: 0,
  };
  for (const item of items) counts[item.status] += 1;
  return counts;
}
