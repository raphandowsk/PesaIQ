/**
 * A Tanzania mobile-money reading (features/parser/tz) as the app's
 * ParseResult: the same fields, fee and tax lines and categories as any other
 * message, with the specification's own kind, operator and extras kept in
 * `details`. A reading below 0.50 is not a transaction (§30): it comes back
 * with no type, for the person to save for review or leave.
 */
import {
  CATEGORY_TO_TYPE,
  DEFAULT_CURRENCY,
  MONEY_CATEGORY_LABELS,
  TYPE_LABELS,
  type MessageCategory,
} from '../../types/domain';
import { checkCharges, extractTaxes } from './charges';
import { bandFor } from './confidence';
import { buildField, cents, describeTaxes, money } from './fields';
import { inferMoneyCategory } from './moneyCategory';
import { normalizationNote, type NormalizedSms } from './normalizer';
import { PROVIDERS } from './providers';
import { EMPTY_DETAILS, type ChargeDetails, type ParsedField, type ParseResult } from './schema';
import { displayDate, OPERATOR_INFO, PARSER_VERSION, TZ_TYPE_LABELS } from './tz';
import { isIncoming } from './tz/classifier';
import type { TzParseOutcome } from './tz/types/parser-result';
import type { ParsedTransaction, TzTransactionType } from './tz/types/transaction';

/** An unknown message never reads as a trusted one: below the review line. */
const UNKNOWN_CEILING = 0.49;

const KIND_TO_CATEGORY: Record<TzTransactionType, MessageCategory> = {
  RECEIVED: 'PAYMENT_RECEIVED',
  SENT: 'PAYMENT_SENT',
  MERCHANT_PAYMENT: 'PAYMENT_SENT',
  BILL_PAYMENT: 'BILL_PAYMENT',
  WITHDRAWAL: 'WITHDRAWAL',
  DEPOSIT: 'DEPOSIT',
  BANK_TRANSFER_IN: 'PAYMENT_RECEIVED',
  BANK_TRANSFER_OUT: 'BANK_TRANSFER',
  AIRTIME_PURCHASE: 'AIRTIME_PURCHASE',
  BUNDLE_PURCHASE: 'AIRTIME_PURCHASE',
  GOVERNMENT_PAYMENT: 'BILL_PAYMENT',
  INTERNATIONAL_TRANSFER: 'PAYMENT_SENT',
  REVERSAL: 'PAYMENT_RECEIVED',
  REFUND: 'PAYMENT_RECEIVED',
  BALANCE_NOTIFICATION: 'BALANCE_UPDATE',
  UNKNOWN: 'OTHER',
};

function categoryOf(tx: ParsedTransaction, unknown: boolean): MessageCategory {
  if (unknown) {
    if (tx.nonTransaction) return tx.nonTransaction;
    return tx.transactionType === 'BALANCE_NOTIFICATION' ? 'BALANCE_UPDATE' : 'OTHER';
  }
  // A failed or pending transaction moved no money.
  if (tx.status !== 'SUCCESS') return 'OTHER';
  const t = tx.transactionType;
  if (t === 'INTERNATIONAL_TRANSFER' || t === 'REVERSAL' || t === 'REFUND') {
    return isIncoming(t, tx.direction) ? 'PAYMENT_RECEIVED' : 'PAYMENT_SENT';
  }
  return KIND_TO_CATEGORY[t];
}

export function resultFromTz(sms: NormalizedSms, outcome: TzParseOutcome): ParseResult {
  const unknown = outcome.kind === 'unknown';
  const tx = outcome.kind === 'transaction' ? outcome.transaction : outcome.closest;
  const info = OPERATOR_INFO[tx.operator];
  const text = sms.normalizedText;

  const category = categoryOf(tx, unknown);
  const type = CATEGORY_TO_TYPE[category];
  const incoming = isIncoming(tx.transactionType, tx.direction);
  const party = incoming ? tx.sender : tx.recipient;
  const counterparty = party?.name ?? tx.merchant?.name ?? tx.bank?.name ?? null;
  const masked = party?.phone ?? tx.merchant?.number ?? tx.bank?.account ?? null;
  const date = displayDate(tx.transactionAt);
  const operatorKnown = tx.factors[0]?.hit ?? false;

  const charges = checkCharges({
    fee: tx.fee,
    // A levy of TSH 0.00 is stated, not charged.
    taxes: extractTaxes(text, { hasFee: tx.fee != null, receipt: false }).filter(
      (t) => t.amount > 0,
    ),
    receipt: null,
  });
  const taxes = charges.taxes;
  const taxTotal = cents(taxes.reduce((sum, t) => sum + t.amount, 0));

  const details: ChargeDetails = {
    ...EMPTY_DETAILS,
    receipt: tx.reference,
    network: tx.network,
    merchant: tx.merchant != null,
    kind: tx.transactionType,
    operator: tx.operator,
    messageStatus: tx.status,
    template: tx.template,
    billReference: tx.billReference,
    paymentType: tx.paymentType,
    merchantNumber: tx.merchant?.number ?? null,
    bankName: tx.bank?.name ?? null,
    bankAccount: tx.bank?.account ?? null,
    controlNumber: tx.controlNumber,
    parserVersion: tx.parserVersion,
  };

  const moneyCategory = inferMoneyCategory({
    type,
    counterparty,
    text,
    // Only a Lipa or till payment is shopping by default; a bill is a bill.
    merchant: tx.transactionType === 'MERCHANT_PAYMENT',
  });

  const confidence = unknown ? Math.min(tx.confidence, UNKNOWN_CEILING) : tx.confidence;
  const kindLabel = TZ_TYPE_LABELS[tx.transactionType];

  const extras: ParsedField[] = [
    ...(tx.billReference
      ? [buildField('billReference', 'Bill reference', tx.billReference, tx.billReference, 0.9)]
      : []),
    ...(tx.paymentType
      ? [buildField('paymentType', 'Payment type', tx.paymentType, tx.paymentType, 0.85)]
      : []),
    ...(tx.controlNumber
      ? [buildField('controlNumber', 'Control number', tx.controlNumber, tx.controlNumber, 0.9)]
      : []),
  ];

  const fields: ParsedField[] = [
    buildField(
      'category',
      'Type',
      category,
      unknown ? TYPE_LABELS[type] : `${kindLabel} - ${TYPE_LABELS[type]}`,
      unknown ? 0.5 : 0.9,
    ),
    buildField(
      'moneyCategory',
      'Category',
      moneyCategory,
      moneyCategory ? MONEY_CATEGORY_LABELS[moneyCategory] : 'Not set',
      moneyCategory ? 0.8 : 0,
    ),
    buildField('provider', 'Provider', info.name, info.name, operatorKnown ? 0.9 : 0.6),
    buildField(
      'amount',
      'Amount',
      tx.amount,
      tx.amount == null ? 'Missing' : money(tx.amount),
      tx.amount == null ? 0 : 0.95,
    ),
    buildField(
      'fee',
      'Fee as stated',
      tx.fee,
      tx.fee == null ? 'None stated' : money(tx.fee),
      tx.fee == null ? 0 : 0.9,
    ),
    buildField(
      'taxes',
      'Taxes',
      taxes.length > 0 ? taxTotal : null,
      taxes.length > 0 ? describeTaxes(taxes) : 'None stated',
      taxes.length > 0 ? charges.taxConfidence : 0,
    ),
    buildField(
      'counterparty',
      'Counterparty',
      counterparty,
      counterparty ?? 'Not found',
      counterparty ? 0.9 : 0,
    ),
    buildField('masked', 'Account / phone', masked, masked ?? 'Not found', masked ? 0.85 : 0),
    buildField(
      'reference',
      'Reference',
      tx.transactionId,
      tx.transactionId ?? 'Not found',
      tx.transactionId ? 0.93 : 0,
    ),
    buildField(
      'balance',
      'Balance after',
      tx.balance,
      tx.balance == null ? 'Not found' : money(tx.balance),
      tx.balance == null ? 0 : 0.9,
    ),
    buildField(
      'date',
      'Date',
      date,
      date ? `${date}${tx.transactionTime ? ` - ${tx.transactionTime}` : ''}` : 'Not found',
      date ? 0.9 : 0,
    ),
    ...extras,
  ];

  const maturity = PROVIDERS.find((p) => p.id === info.providerId)?.maturity ?? 'EXPERIMENTAL';

  return {
    originalText: sms.originalText,
    normalizedText: text,
    normalizationNote: normalizationNote(sms),
    sender: sms.sender,

    category,
    type,

    provider: info.name,
    providerId: info.providerId,

    amount: tx.amount,
    currency: tx.amount == null ? null : DEFAULT_CURRENCY,
    counterparty,
    maskedAccountOrPhone: masked,
    transactionReference: tx.transactionId,
    balanceAfter: tx.balance,
    transactionDate: date,
    transactionTime: tx.transactionTime,

    moneyCategory,
    fee: tx.fee,
    taxes,
    details,

    confidence,
    band: bandFor(confidence),
    parserId: `TZ mobile money ${PARSER_VERSION} · ${info.short} rules (${maturity})`,

    warnings: [...tx.warnings, ...charges.warnings],
    reasons: [
      ...tx.signals,
      ...(tx.template ? [`Matches the documented layout ${tx.template}`] : []),
      `${kindLabel}: ${tx.description?.toLowerCase() ?? ''}`.replace(/: $/, ''),
      ...charges.reasons,
    ],
    factors: tx.factors,
    fields,
  };
}
