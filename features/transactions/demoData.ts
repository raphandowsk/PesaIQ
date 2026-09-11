/**
 * Generated sample records, ported from the design canvas seed.
 *
 * ALL OF THIS IS INVENTED. Every name, number, reference and message is
 * fabricated. Each record carries `isDemo: true` so "Remove demo data" can
 * delete exactly these and leave anything the user saved untouched, and so the
 * dashboard can warn that the figures are not real.
 */
import type { Transaction } from './model';

/**
 * Fixed timestamps, not `Date.now()`. Demo data that shifts every launch makes
 * the dashboard impossible to reason about and the tests impossible to pin.
 */
const SEED_AT = '2026-03-12T09:00:00.000Z';

const DEMO_PREFIX = 'DEMO SAMPLE (anonymized)';

export interface DemoRecord {
  transaction: Transaction;
  /** Source text, stored alongside so the detail view can show it. */
  messageText: string;
  sender: string;
}

/** Ordered newest first, matching how the dashboard lists them. */
export const DEMO_RECORDS: DemoRecord[] = [
  {
    sender: 'DEMO-WALLET-A',
    messageText: `${DEMO_PREFIX}\nYou have received TZS 250,000.00 from JOHN MWAKASEGE 0712345678 on 12/03/26 at 14:22. Ref: QH42T8LM9P. New balance TZS 812,400.00.`,
    transaction: {
      id: 'demo-t1',
      type: 'RECEIVED',
      status: 'CONFIRMED',
      provider: 'Wallet A (M-Pesa-like demo)',
      providerId: 'mpesa',
      amount: 250000,
      currency: 'TZS',
      counterparty: 'JOHN M.',
      maskedAccountOrPhone: '07** *** 678',
      transactionReference: 'QH42T8LM9P',
      balanceAfter: 812400,
      transactionDate: '12 Mar 2026',
      transactionTime: '14:22',
      confidence: 0.96,
      lowFields: [],
      sourceMessageId: 'demo-m1',
      parseResultId: null,
      isDemo: true,
      createdAt: SEED_AT,
      updatedAt: SEED_AT,
    },
  },
  {
    sender: 'DEMO-WALLET-B',
    messageText: `${DEMO_PREFIX}\nUmetuma TZS 45,000 kwa GRACE KIMARO 0687776887. Muamala 8FR2K1DD. Salio TZS 133,900. Ada TZS 1,000.`,
    transaction: {
      id: 'demo-t2',
      type: 'SENT',
      status: 'PARSED',
      provider: 'Wallet B (Airtel-like demo)',
      providerId: 'airtel',
      amount: 45000,
      currency: 'TZS',
      counterparty: 'GRACE K.',
      maskedAccountOrPhone: '06** *** 887',
      transactionReference: '8FR2K1DD',
      balanceAfter: 133900,
      transactionDate: '12 Mar 2026',
      transactionTime: '11:04',
      confidence: 0.88,
      lowFields: [],
      sourceMessageId: 'demo-m2',
      parseResultId: null,
      isDemo: true,
      createdAt: '2026-03-12T08:04:00.000Z',
      updatedAt: '2026-03-12T08:04:00.000Z',
    },
  },
  {
    sender: 'DEMO-BANK',
    messageText: `${DEMO_PREFIX}\nAcct ****4312 debited TZS 120,000.00 ATM withdrawal 11/03/26 09:07. Avail bal TZS 2,415,300.00. TxnID BK7741902.`,
    transaction: {
      id: 'demo-t3',
      type: 'WITHDRAWAL',
      status: 'NEEDS_REVIEW',
      provider: 'Demo Bank',
      providerId: 'bank',
      amount: 120000,
      currency: 'TZS',
      counterparty: 'ATM withdrawal',
      maskedAccountOrPhone: '**** 4312',
      transactionReference: 'BK7741902',
      balanceAfter: 2415300,
      transactionDate: '11 Mar 2026',
      transactionTime: '09:07',
      confidence: 0.74,
      lowFields: ['counterparty'],
      sourceMessageId: 'demo-m3',
      parseResultId: null,
      isDemo: true,
      createdAt: '2026-03-11T06:07:00.000Z',
      updatedAt: '2026-03-11T06:07:00.000Z',
    },
  },
  {
    sender: 'DEMO-UNKNOWN',
    messageText: `${DEMO_PREFIX}\nUmenunua muda wa maongezi 5000. Asante.`,
    transaction: {
      id: 'demo-t4',
      type: 'AIRTIME',
      status: 'NEEDS_REVIEW',
      provider: null,
      providerId: null,
      amount: 5000,
      currency: 'TZS',
      counterparty: null,
      maskedAccountOrPhone: null,
      transactionReference: null,
      balanceAfter: null,
      transactionDate: '10 Mar 2026',
      transactionTime: '18:40',
      confidence: 0.58,
      lowFields: ['counterparty', 'reference', 'amount'],
      sourceMessageId: 'demo-m4',
      parseResultId: null,
      isDemo: true,
      createdAt: '2026-03-10T15:40:00.000Z',
      updatedAt: '2026-03-10T15:40:00.000Z',
    },
  },
  {
    sender: 'DEMO-BANK',
    messageText: `${DEMO_PREFIX}\nAcct ****4312 credited TZS 1,200,000.00 PAYROLL BATCH 05/03/26 07:15. TxnID BK7710455.`,
    transaction: {
      id: 'demo-t5',
      type: 'RECEIVED',
      status: 'CONFIRMED',
      provider: 'Demo Bank',
      providerId: 'bank',
      amount: 1200000,
      currency: 'TZS',
      counterparty: 'PAYROLL BATCH',
      maskedAccountOrPhone: '**** 4312',
      transactionReference: 'BK7710455',
      balanceAfter: 2535300,
      transactionDate: '05 Mar 2026',
      transactionTime: '07:15',
      confidence: 0.93,
      lowFields: [],
      sourceMessageId: 'demo-m5',
      parseResultId: null,
      isDemo: true,
      createdAt: '2026-03-05T04:15:00.000Z',
      updatedAt: '2026-03-05T04:15:00.000Z',
    },
  },
  {
    sender: 'DEMO-WALLET-A',
    messageText: `${DEMO_PREFIX}\nUmelipa TZS 38,500 LUKU TOKEN. Muamala QH39LL22B. Salio TZS 566,900.`,
    transaction: {
      id: 'demo-t6',
      type: 'BILL_PAYMENT',
      status: 'CONFIRMED',
      provider: 'Wallet A (M-Pesa-like demo)',
      providerId: 'mpesa',
      amount: 38500,
      currency: 'TZS',
      counterparty: 'LUKU TOKEN',
      maskedAccountOrPhone: '07** *** 678',
      transactionReference: 'QH39LL22B',
      balanceAfter: 566900,
      transactionDate: '04 Mar 2026',
      transactionTime: '20:12',
      confidence: 0.81,
      lowFields: [],
      sourceMessageId: 'demo-m6',
      parseResultId: null,
      isDemo: true,
      createdAt: '2026-03-04T17:12:00.000Z',
      updatedAt: '2026-03-04T17:12:00.000Z',
    },
  },
];

/** Message id for a demo record, matching `sourceMessageId`. */
export const demoMessageId = (index: number): string => `demo-m${index + 1}`;
