/**
 * Runtime validation for parse output.
 *
 * The engine is pure TypeScript, so this is not guarding against our own
 * regexes. It exists because Stage 2's native SMS source and the eventual AI
 * fallback will both produce ParseResults from outside this module, and neither
 * can be trusted to be well-formed. Validating at the boundary means the
 * database and the UI only ever see a shape they can rely on.
 */
import { z } from 'zod';

import { MESSAGE_CATEGORIES, TRANSACTION_TYPES } from '../../types/domain';

export const parsedFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  /** Raw value as text; empty string means absent. */
  value: z.string(),
  /** What to show the user, e.g. "TZS 250,000" or "Not found". */
  display: z.string(),
  confidence: z.number().min(0).max(1),
  low: z.boolean(),
  missing: z.boolean(),
  /** Set once a user has corrected the field by hand. */
  verified: z.boolean().optional(),
});

export const confidenceFactorSchema = z.object({
  label: z.string(),
  hit: z.boolean(),
  weight: z.number().min(0).max(1),
});

export const parseResultSchema = z.object({
  originalText: z.string(),
  normalizedText: z.string(),
  normalizationNote: z.string(),
  sender: z.string().optional(),

  category: z.enum(MESSAGE_CATEGORIES),
  type: z.enum(TRANSACTION_TYPES),

  provider: z.string().nullable(),
  providerId: z.string().nullable(),

  amount: z.number().nullable(),
  currency: z.string().nullable(),
  counterparty: z.string().nullable(),
  /** Already masked at extraction; an unmasked value must never appear. */
  maskedAccountOrPhone: z.string().nullable(),
  transactionReference: z.string().nullable(),
  balanceAfter: z.number().nullable(),
  transactionDate: z.string().nullable(),
  transactionTime: z.string().nullable(),

  confidence: z.number().min(0).max(1),
  band: z.enum(['Very high', 'High', 'Medium', 'Needs review']),
  parserId: z.string(),

  warnings: z.array(z.string()),
  reasons: z.array(z.string()),
  factors: z.array(confidenceFactorSchema),
  fields: z.array(parsedFieldSchema),
});

export type ParseResult = z.infer<typeof parseResultSchema>;
export type ParsedField = z.infer<typeof parsedFieldSchema>;

export interface ParseValidation {
  ok: boolean;
  result?: ParseResult;
  errors?: string[];
}

/**
 * Validate an untrusted ParseResult. Returns readable paths rather than
 * throwing, so a bad result can be shown as a failed parse instead of crashing
 * the screen.
 */
export function validateParseResult(input: unknown): ParseValidation {
  const parsed = parseResultSchema.safeParse(input);
  if (parsed.success) return { ok: true, result: parsed.data };

  return {
    ok: false,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
