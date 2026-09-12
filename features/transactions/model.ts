/**
 * The transaction record, and how it maps to and from a database row.
 *
 * Rows use snake_case and store booleans as integers and arrays as JSON; the
 * app works with camelCase objects. Keeping both mappers here means the
 * repositories stay about querying rather than shape-juggling.
 */
import { z } from 'zod';

import {
  DEFAULT_CURRENCY,
  MONEY_CATEGORIES,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  type MoneyCategory,
  type TransactionStatus,
  type TransactionType,
} from '../../types/domain';
import type { ParseResult } from '../parser';
import { chargeDetailsSchema, EMPTY_DETAILS, taxLineSchema } from '../parser/schema';

export const transactionSchema = z.object({
  id: z.string(),
  type: z.enum(TRANSACTION_TYPES),
  status: z.enum(TRANSACTION_STATUSES),

  provider: z.string().nullable(),
  providerId: z.string().nullable(),

  amount: z.number().nullable(),
  currency: z.string().nullable(),
  counterparty: z.string().nullable(),
  /** Stored already masked; an unmasked identifier must never reach here. */
  maskedAccountOrPhone: z.string().nullable(),
  transactionReference: z.string().nullable(),
  balanceAfter: z.number().nullable(),
  transactionDate: z.string().nullable(),
  transactionTime: z.string().nullable(),

  /** What the money was for. Null for a record that is not a transaction. */
  moneyCategory: z.enum(MONEY_CATEGORIES).nullable(),
  /** Charged on top of the amount, any VAT inside it included. */
  fee: z.number().nullable(),
  /** Each tax the message itemised, and where it sits (see `TaxLine`). */
  taxes: z.array(taxLineSchema),
  /** Receipt number, network, merchant flag and LUKU details. */
  details: chargeDetailsSchema,

  confidence: z.number().min(0).max(1),
  /** Keys of fields the parser was unsure about; drives the review queue. */
  lowFields: z.array(z.string()),

  sourceMessageId: z.string().nullable(),
  parseResultId: z.string().nullable(),

  /** Generated sample data, removable via Settings. */
  isDemo: z.boolean(),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Transaction = z.infer<typeof transactionSchema>;

export interface TransactionRow {
  id: string;
  type: string;
  status: string;
  provider: string | null;
  provider_id: string | null;
  amount: number | null;
  currency: string | null;
  counterparty: string | null;
  masked_account_or_phone: string | null;
  transaction_reference: string | null;
  balance_after: number | null;
  transaction_date: string | null;
  transaction_time: string | null;
  confidence: number;
  low_fields: string;
  source_message_id: string | null;
  parse_result_id: string | null;
  is_demo: number;
  created_at: string;
  updated_at: string;
  money_category: string | null;
  fee: number | null;
  taxes: string | null;
  details: string | null;
}

/** Tolerates malformed JSON rather than throwing on a corrupt row. */
function parseLowFields(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** A JSON column read through its schema, with a safe fallback for a corrupt row. */
function parseJsonColumn<T>(raw: string | null, schema: z.ZodType<T>, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : fallback;
  } catch {
    return fallback;
  }
}

const isMoneyCategory = (v: string | null): v is MoneyCategory =>
  v != null && (MONEY_CATEGORIES as readonly string[]).includes(v);

export function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as TransactionType,
    status: row.status as TransactionStatus,
    provider: row.provider,
    providerId: row.provider_id,
    amount: row.amount,
    currency: row.currency,
    counterparty: row.counterparty,
    maskedAccountOrPhone: row.masked_account_or_phone,
    transactionReference: row.transaction_reference,
    balanceAfter: row.balance_after,
    transactionDate: row.transaction_date,
    transactionTime: row.transaction_time,
    moneyCategory: isMoneyCategory(row.money_category) ? row.money_category : null,
    fee: row.fee,
    taxes: parseJsonColumn(row.taxes, z.array(taxLineSchema), []),
    details: parseJsonColumn(row.details, chargeDetailsSchema, EMPTY_DETAILS),
    confidence: row.confidence,
    lowFields: parseLowFields(row.low_fields),
    sourceMessageId: row.source_message_id,
    parseResultId: row.parse_result_id,
    isDemo: row.is_demo === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Column order used by every INSERT, so the two cannot drift apart. */
export const TRANSACTION_COLUMNS = [
  'id',
  'type',
  'status',
  'provider',
  'provider_id',
  'amount',
  'currency',
  'counterparty',
  'masked_account_or_phone',
  'transaction_reference',
  'balance_after',
  'transaction_date',
  'transaction_time',
  'confidence',
  'low_fields',
  'source_message_id',
  'parse_result_id',
  'is_demo',
  'created_at',
  'updated_at',
  'money_category',
  'fee',
  'taxes',
  'details',
] as const;

export function transactionToParams(t: Transaction): (string | number | null)[] {
  return [
    t.id,
    t.type,
    t.status,
    t.provider,
    t.providerId,
    t.amount,
    t.currency,
    t.counterparty,
    t.maskedAccountOrPhone,
    t.transactionReference,
    t.balanceAfter,
    t.transactionDate,
    t.transactionTime,
    t.confidence,
    JSON.stringify(t.lowFields),
    t.sourceMessageId,
    t.parseResultId,
    t.isDemo ? 1 : 0,
    t.createdAt,
    t.updatedAt,
    t.moneyCategory,
    t.fee,
    JSON.stringify(t.taxes),
    JSON.stringify(t.details),
  ];
}

/**
 * Below this a record cannot be trusted and goes to the review queue rather
 * than straight into the totals. Matches the confidence engine's medium band.
 */
export const REVIEW_THRESHOLD = 0.6;

export interface DraftOptions {
  id: string;
  now: string;
  sourceMessageId?: string | null;
  parseResultId?: string | null;
  isDemo?: boolean;
}

/**
 * Turn a parse into a saveable record.
 *
 * Status is decided here rather than by the caller: anything under the review
 * threshold, and anything the parser could not put an amount on, needs a human
 * before it counts.
 */
export function transactionFromParseResult(
  result: ParseResult,
  options: DraftOptions,
): Transaction {
  const needsReview = result.confidence < REVIEW_THRESHOLD || result.amount == null;

  return {
    id: options.id,
    type: result.type,
    status: needsReview ? 'NEEDS_REVIEW' : 'PARSED',
    provider: result.provider,
    providerId: result.providerId,
    amount: result.amount,
    currency: result.amount == null ? null : (result.currency ?? DEFAULT_CURRENCY),
    counterparty: result.counterparty,
    maskedAccountOrPhone: result.maskedAccountOrPhone,
    transactionReference: result.transactionReference,
    balanceAfter: result.balanceAfter,
    transactionDate: result.transactionDate,
    transactionTime: result.transactionTime,
    moneyCategory: result.moneyCategory,
    fee: result.fee,
    taxes: result.taxes,
    details: result.details,
    confidence: result.confidence,
    lowFields: result.fields.filter((f) => f.low).map((f) => f.key),
    sourceMessageId: options.sourceMessageId ?? null,
    parseResultId: options.parseResultId ?? null,
    isDemo: options.isDemo ?? false,
    createdAt: options.now,
    updatedAt: options.now,
  };
}
