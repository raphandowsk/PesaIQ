/**
 * Stage 1 of the pipeline (§2): tidy the message without changing its words.
 *
 * Case is kept: names are written in capitals and some markers ("LIPA") are
 * only safe to match that way. Line breaks are kept too: receipt layouts put
 * a label on one line and its value on the next.
 */
import type { NormalizedSmsMessage, SmsMessage } from './types/parser-result';

export function normalizeSmsText(body: string): string {
  return (
    body
      // Invisible characters some phones insert.
      .replace(/[​-‍﻿]/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[   \t]/g, ' ')
      // En and em dashes, and the minus sign, read as a plain hyphen.
      .replace(/[‒-―−]/g, '-')
      .replace(/[‘’]/g, "'")
      .replace(/ {2,}/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

export function normalizeSenderId(sender: string | null | undefined): string | null {
  const s = (sender ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return s || null;
}

export function normalizeSms(message: SmsMessage): NormalizedSmsMessage {
  return {
    raw: message.body,
    text: normalizeSmsText(message.body),
    senderRaw: message.sender?.trim() || null,
    senderNormalized: normalizeSenderId(message.sender),
    receivedAt: message.receivedAt ?? null,
  };
}
