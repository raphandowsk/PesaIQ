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

import {
  MESSAGE_CATEGORIES,
  MONEY_CATEGORIES,
  TAX_CODES,
  TRANSACTION_TYPES,
} from '../../types/domain';
import { TZ_STATUSES, TZ_TRANSACTION_TYPES } from './tz/types/transaction';

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

export const taxLineSchema = z.object({
  code: z.enum(TAX_CODES),
  amount: z.number().min(0),
  /** As stated in the message ("VAT 18%"), or null when none was given. */
  ratePct: z.number().nullable(),
  /**
   * Where the tax sits. `fee`: already inside the fee ("Ada TSh 495. VAT TSh
   * 76" - 495 left the balance, 76 of it VAT). `amount`: inside the amount paid
   * (a LUKU receipt's VAT, EWURA and REA). `extra`: charged on top of both.
   */
  within: z.enum(['fee', 'amount', 'extra']),
});

/** Everything else a message itemised, beyond the core fields. */
export const chargeDetailsSchema = z.object({
  /** A second reference some wallets add ("Risiti: 503-..."). */
  receipt: z.string().nullable().default(null),
  /** The network the money went to ("Vodacom", "Halo Pesa"). */
  network: z.string().nullable().default(null),
  /** Paid to a merchant (a Lipa number or a named business) rather than a person. */
  merchant: z.boolean().default(false),
  /** LUKU: units bought, e.g. "51.9 kWh". */
  units: z.string().nullable().default(null),
  /** LUKU: the meter number, masked. */
  meterNumber: z.string().nullable().default(null),
  /** LUKU: the token to type into the meter. Kept, and shown only on request. */
  token: z.string().nullable().default(null),
  /** LUKU: the price of the units before tax. */
  netCost: z.number().nullable().default(null),
  /** LUKU: old electricity debt recovered from this payment. Not a tax. */
  debtCollected: z.number().nullable().default(null),

  // From the Tanzania mobile-money parser (features/parser/tz). Null for
  // anything else, and for records saved before it.
  /** The transaction in the specification's own terms ("MERCHANT_PAYMENT"). */
  kind: z.enum(TZ_TRANSACTION_TYPES).nullable().default(null),
  /** "MPESA_TZ", "MIXX_TZ", … */
  operator: z.string().nullable().default(null),
  /** As the message states it: a failed or pending transaction moved no money. */
  messageStatus: z.enum(TZ_STATUSES).nullable().default(null),
  /** The documented layout that matched ("TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE"). */
  template: z.string().nullable().default(null),
  /** The customer's reference at the biller, masked when it is a phone number. */
  billReference: z.string().nullable().default(null),
  /** "Pay Bill". */
  paymentType: z.string().nullable().default(null),
  /** A Lipa, till or business number, masked. */
  merchantNumber: z.string().nullable().default(null),
  bankName: z.string().nullable().default(null),
  /** Masked. */
  bankAccount: z.string().nullable().default(null),
  /** A GePG control number, masked. */
  controlNumber: z.string().nullable().default(null),
  /** Which parser version read it, so an old record stays auditable. */
  parserVersion: z.string().nullable().default(null),
});

export const EMPTY_DETAILS = chargeDetailsSchema.parse({});

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

  // Added with fees, taxes and categories. Defaults keep results saved before
  // then readable.
  moneyCategory: z.enum(MONEY_CATEGORIES).nullable().default(null),
  /** Charged on top of the amount, as the message states it (VAT inside it included). */
  fee: z.number().nullable().default(null),
  taxes: z.array(taxLineSchema).default([]),
  details: chargeDetailsSchema.default(EMPTY_DETAILS),

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
export type TaxLine = z.infer<typeof taxLineSchema>;
export type ChargeDetails = z.infer<typeof chargeDetailsSchema>;

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
