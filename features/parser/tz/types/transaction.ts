/**
 * The normalized transaction the Tanzania parser returns (§4, §35).
 *
 * Every phone, account, merchant and control number in it is already masked:
 * a full number never leaves the parser. `rawSms` is the message itself, held
 * in memory for the caller and never logged (§46).
 */
import type { Operator } from './operator';

/** §5: a fixed list. */
export const TZ_TRANSACTION_TYPES = [
  'RECEIVED',
  'SENT',
  'MERCHANT_PAYMENT',
  'BILL_PAYMENT',
  'WITHDRAWAL',
  'DEPOSIT',
  'BANK_TRANSFER_IN',
  'BANK_TRANSFER_OUT',
  'AIRTIME_PURCHASE',
  'BUNDLE_PURCHASE',
  'GOVERNMENT_PAYMENT',
  'INTERNATIONAL_TRANSFER',
  'REVERSAL',
  'REFUND',
  'BALANCE_NOTIFICATION',
  'UNKNOWN',
] as const;
export type TzTransactionType = (typeof TZ_TRANSACTION_TYPES)[number];

export const TZ_TYPE_LABELS: Record<TzTransactionType, string> = {
  RECEIVED: 'Money received',
  SENT: 'Money sent',
  MERCHANT_PAYMENT: 'Merchant payment',
  BILL_PAYMENT: 'Bill payment',
  WITHDRAWAL: 'Cash withdrawal',
  DEPOSIT: 'Cash deposit',
  BANK_TRANSFER_IN: 'From a bank',
  BANK_TRANSFER_OUT: 'To a bank',
  AIRTIME_PURCHASE: 'Airtime',
  BUNDLE_PURCHASE: 'Bundle',
  GOVERNMENT_PAYMENT: 'Government payment',
  INTERNATIONAL_TRANSFER: 'International transfer',
  REVERSAL: 'Reversal',
  REFUND: 'Refund',
  BALANCE_NOTIFICATION: 'Balance notice',
  UNKNOWN: 'Unknown',
};

export const TZ_STATUSES = ['SUCCESS', 'FAILED', 'PENDING'] as const;
export type TzStatus = (typeof TZ_STATUSES)[number];

/** Which way the money moved, from the wallet's side. */
export type Direction = 'in' | 'out';

export interface Party {
  name: string | null;
  /** Masked: "07** *** 678". */
  phone: string | null;
}

export interface Merchant {
  name: string | null;
  /** A Lipa, till or business number, masked: "**** 4567". */
  number: string | null;
}

export interface Bank {
  name: string | null;
  /** Masked. */
  account: string | null;
}

export interface TzConfidenceFactor {
  label: string;
  hit: boolean;
  weight: number;
}

export interface ParsedTransaction {
  operator: Operator;
  transactionType: TzTransactionType;
  status: TzStatus;
  direction: Direction | null;

  transactionId: string | null;
  amount: number | null;
  currency: 'TZS';
  /** As the message states it, taxes inside it included. */
  fee: number | null;
  /** HaloPesa's "TOZO ya serikali", when stated. */
  governmentLevy: number | null;
  balance: number | null;

  sender: Party | null;
  recipient: Party | null;
  merchant: Merchant | null;
  bank: Bank | null;
  /** The network on the other side of a cross-network transfer. */
  network: string | null;

  /** A second reference some layouts add (Mixx "Risiti"). */
  reference: string | null;
  billReference: string | null;
  paymentType: string | null;
  /** GePG control number, masked. */
  controlNumber: string | null;
  description: string | null;

  /** "2013-08-08T19:52:00", or "2013-08-08" when the message gives no time. */
  transactionAt: string | null;
  /** 24-hour "19:52", also when the message gives a time but no date. */
  transactionTime: string | null;

  confidence: number;
  factors: TzConfidenceFactor[];
  parserVersion: string;
  /** The documented layout that matched, e.g. "MPESA_RECEIVED_HISTORICAL". */
  template: string | null;
  /** Plainly not money: a one-time code or a promotion. */
  nonTransaction: 'OTP' | 'PROMOTIONAL' | null;
  /** Why the operator was chosen, for "How we got this". */
  signals: string[];
  warnings: string[];

  /** §31: an SMS can be spoofed. Parsed is never verified. */
  parsed: true;
  verified: false;

  rawSms: string;
  senderId: string | null;
}
