/**
 * What a synced record carries, before it is locked.
 *
 * Everything that describes the money, and nothing that only makes sense on
 * one phone: the local id, the links to the stored SMS and its parse (the SMS
 * itself never leaves the phone), demo marking and duplicate review.
 */
import { z } from 'zod';

import { transactionSchema, type Transaction } from '../transactions/model';

export const payloadSchema = transactionSchema.omit({
  id: true,
  sourceMessageId: true,
  parseResultId: true,
  isDemo: true,
  duplicateOf: true,
});

export type RecordPayload = z.infer<typeof payloadSchema>;

const envelopeSchema = z.object({ v: z.literal(1), record: payloadSchema });

/**
 * JSON with every character above ASCII escaped (\uXXXX), so the bytes are
 * plain ASCII and need no TextEncoder or TextDecoder either way.
 */
function toAsciiBytes(value: unknown): Uint8Array {
  const text = JSON.stringify(value).replace(
    /[-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i);
  return bytes;
}

function fromAsciiBytes(bytes: Uint8Array): string | null {
  let text = '';
  for (let i = 0; i < bytes.length; i += 4096) {
    const chunk = bytes.subarray(i, i + 4096);
    // Only printable ASCII is ever written.
    if (chunk.some((b) => b < 0x20 || b > 0x7e)) return null;
    text += String.fromCharCode(...chunk);
  }
  return text;
}

export const encodePayload = (t: Transaction): Uint8Array =>
  toAsciiBytes({ v: 1, record: payloadSchema.parse(t) });

/** What a deleted record's row holds: nothing about the record. */
export const tombstoneBytes = (): Uint8Array => toAsciiBytes({ v: 1, deleted: true });

/** The record, or null for anything this app did not write. */
export function decodePayload(bytes: Uint8Array): RecordPayload | null {
  const text = fromAsciiBytes(bytes);
  if (text === null) return null;
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.record : null;
  } catch {
    return null;
  }
}
