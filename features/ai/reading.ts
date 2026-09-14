/**
 * What Claude read from a message (the parse-sms function's answer), checked
 * again on the phone: the function sits outside the app, so its answer is
 * validated like any other untrusted input.
 */
import { z } from 'zod';

import { MESSAGE_CATEGORIES, MONEY_CATEGORIES, TAX_CODES } from '../../types/domain';

/** The Result screen's rows, as the AI names them in `unsure`. */
export const AI_FIELD_KEYS = [
  'category',
  'provider',
  'amount',
  'fee',
  'taxes',
  'counterparty',
  'masked',
  'reference',
  'balance',
  'date',
  'moneyCategory',
] as const;

export const aiReadingSchema = z.object({
  id: z.string(),
  isMoney: z.boolean(),
  category: z.enum(MESSAGE_CATEGORIES),
  provider: z.string().nullable(),
  amount: z.number().nonnegative().nullable(),
  currency: z.string().nullable(),
  fee: z.number().nonnegative().nullable(),
  taxes: z.array(
    z.object({
      code: z.enum(TAX_CODES),
      amount: z.number().nonnegative(),
      ratePct: z.number().nullable(),
      within: z.enum(['fee', 'amount', 'extra']),
    }),
  ),
  counterparty: z.string().nullable(),
  counterpartyNumber: z.string().nullable(),
  reference: z.string().nullable(),
  balanceAfter: z.number().nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  moneyCategory: z.enum(MONEY_CATEGORIES).nullable(),
  merchant: z.boolean(),
  network: z.string().nullable(),
  unsure: z.array(z.enum(AI_FIELD_KEYS)),
});

export type AiReading = z.infer<typeof aiReadingSchema>;

/** One message to read; its text already masked (mask.ts). */
export interface AiRequest {
  id: string;
  text: string;
  sender: string | null;
}

export interface AiAnswer {
  /** The Claude model that read them. */
  model: string;
  readings: AiReading[];
}

export type AiFailure = 'offline' | 'limit' | 'unavailable';

export class AiUnavailableError extends Error {
  readonly reason: AiFailure;
  constructor(reason: AiFailure) {
    super(`AI reading unavailable: ${reason}`);
    this.name = 'AiUnavailableError';
    this.reason = reason;
  }
}

/** By name rather than `instanceof`, which a transpiled Error subclass can lose. */
export const aiFailureOf = (e: unknown): AiFailure =>
  e instanceof Error && e.name === 'AiUnavailableError'
    ? (e as AiUnavailableError).reason
    : 'unavailable';

/** The server side. Rejects with AiUnavailableError. */
export interface AiReader {
  read(messages: AiRequest[]): Promise<AiAnswer>;
}

/** Shown on a result the on-phone rules read instead. */
export const AI_FAILURE_NOTES: Record<AiFailure, string> = {
  offline: 'Read on this phone: there was no connection for AI reading.',
  limit: "Read on this phone: today's AI reading limit was reached.",
  unavailable: "Read on this phone: AI reading wasn't available.",
};

/** The readings in an answer that pass the check; the rest are dropped. */
export const validReadings = (raw: unknown): AiReading[] =>
  Array.isArray(raw)
    ? raw.flatMap((r) => {
        const parsed = aiReadingSchema.safeParse(r);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
