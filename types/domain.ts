/**
 * Core domain vocabulary, ported from the design canvas.
 * These string unions are the contract between the parser, the database and
 * the UI — widen them only when the design does.
 */

/** What a message is about. The classifier assigns exactly one. */
export const MESSAGE_CATEGORIES = [
  'PAYMENT_RECEIVED',
  'PAYMENT_SENT',
  'WITHDRAWAL',
  'DEPOSIT',
  'BANK_TRANSFER',
  'AIRTIME_PURCHASE',
  'BILL_PAYMENT',
  'BALANCE_UPDATE',
  'OTP',
  'PROMOTIONAL',
  'SECURITY_ALERT',
  'OTHER',
] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

/** What a saved record is. Derived from the category via CATEGORY_TO_TYPE. */
export const TRANSACTION_TYPES = [
  'RECEIVED',
  'SENT',
  'WITHDRAWAL',
  'DEPOSIT',
  'TRANSFER',
  'AIRTIME',
  'BILL_PAYMENT',
  'UNKNOWN',
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_STATUSES = [
  'PARSED',
  'CONFIRMED',
  'NEEDS_REVIEW',
  'IGNORED',
  'FAILED',
] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

/**
 * How much a provider parser is trusted. Everything ships as DEMO until
 * anonymized fixtures prove otherwise — we do not claim live provider formats.
 */
export const PROVIDER_MATURITIES = ['DEMO', 'EXPERIMENTAL', 'SUPPORTED'] as const;
export type ProviderMaturity = (typeof PROVIDER_MATURITIES)[number];

/** Category → transaction type. Non-financial categories collapse to UNKNOWN. */
export const CATEGORY_TO_TYPE: Record<MessageCategory, TransactionType> = {
  PAYMENT_RECEIVED: 'RECEIVED',
  PAYMENT_SENT: 'SENT',
  WITHDRAWAL: 'WITHDRAWAL',
  DEPOSIT: 'DEPOSIT',
  BANK_TRANSFER: 'TRANSFER',
  AIRTIME_PURCHASE: 'AIRTIME',
  BILL_PAYMENT: 'BILL_PAYMENT',
  BALANCE_UPDATE: 'UNKNOWN',
  OTP: 'UNKNOWN',
  PROMOTIONAL: 'UNKNOWN',
  SECURITY_ALERT: 'UNKNOWN',
  OTHER: 'UNKNOWN',
};

/** Human labels for transaction types. */
export const TYPE_LABELS: Record<TransactionType, string> = {
  RECEIVED: 'Received',
  SENT: 'Sent',
  WITHDRAWAL: 'Withdrawal',
  DEPOSIT: 'Deposit',
  TRANSFER: 'Transfer',
  AIRTIME: 'Airtime',
  BILL_PAYMENT: 'Bill payment',
  UNKNOWN: 'Unknown',
};

/** Types that add money. Used by totals, the health score and row tinting. */
export const IN_TYPES: readonly TransactionType[] = ['RECEIVED', 'DEPOSIT'];
/** Types that remove money. */
export const OUT_TYPES: readonly TransactionType[] = [
  'SENT',
  'WITHDRAWAL',
  'AIRTIME',
  'BILL_PAYMENT',
  'TRANSFER',
];

export const isIncoming = (t: TransactionType): boolean => IN_TYPES.includes(t);
export const isOutgoing = (t: TransactionType): boolean => OUT_TYPES.includes(t);

/** The only currency Stage 1 handles. */
export const DEFAULT_CURRENCY = 'TZS';

/**
 * What the money was for, as a person thinks of it. Picked by rules, corrected
 * by the user, and remembered per recipient. Spending first, then income.
 */
export const MONEY_CATEGORIES = [
  'FOOD_SHOPPING',
  'FUEL_TRANSPORT',
  'ELECTRICITY_WATER',
  'AIRTIME_DATA',
  'BETTING',
  'SENT_TO_PEOPLE',
  'BILLS_SERVICES',
  'CASH_WITHDRAWAL',
  'OTHER_SPENDING',
  'SALARY',
  'BUSINESS',
  'RECEIVED_FROM_PEOPLE',
  'OTHER_INCOME',
] as const;
export type MoneyCategory = (typeof MONEY_CATEGORIES)[number];

export const MONEY_CATEGORY_LABELS: Record<MoneyCategory, string> = {
  FOOD_SHOPPING: 'Food & shopping',
  FUEL_TRANSPORT: 'Fuel & transport',
  ELECTRICITY_WATER: 'Electricity & water',
  AIRTIME_DATA: 'Airtime & data',
  BETTING: 'Betting',
  SENT_TO_PEOPLE: 'Sent to people',
  BILLS_SERVICES: 'Bills & services',
  CASH_WITHDRAWAL: 'Cash withdrawal',
  OTHER_SPENDING: 'Other spending',
  SALARY: 'Salary',
  BUSINESS: 'Business',
  RECEIVED_FROM_PEOPLE: 'Received from people',
  OTHER_INCOME: 'Other income',
};

export const SPENDING_CATEGORIES: readonly MoneyCategory[] = MONEY_CATEGORIES.slice(0, 9);
export const INCOME_CATEGORIES: readonly MoneyCategory[] = MONEY_CATEGORIES.slice(9);

/** Taxes a Tanzanian money message can itemise. */
export const TAX_CODES = ['VAT', 'EXCISE', 'LEVY', 'EWURA', 'REA', 'OTHER'] as const;
export type TaxCode = (typeof TAX_CODES)[number];

export const TAX_LABELS: Record<TaxCode, string> = {
  VAT: 'VAT',
  EXCISE: 'Excise duty',
  LEVY: 'Government levy',
  EWURA: 'EWURA',
  REA: 'REA',
  OTHER: 'Other tax',
};
