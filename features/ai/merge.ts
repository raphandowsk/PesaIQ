/**
 * A parse result from what Claude read, checked against the on-phone rules.
 *
 * Claude's reading comes first; a field it left empty falls back to the rules.
 * Where both read a figure (amount, fee, balance) and they differ, the field
 * is flagged for review with a warning. The rules keep what Claude never sees
 * or knows: the provider registry's name and id for a known sender, and a
 * LUKU receipt's token, units and meter.
 */
import { bandFor, CONFIDENCE_MAX, NON_TRANSACTIONAL_CAP } from '../parser';
import { buildField, describeTaxes, formatAmount } from '../parser/engine';
import type { ParsedField, ParseResult } from '../parser/schema';
import {
  CATEGORY_TO_TYPE,
  DEFAULT_CURRENCY,
  MONEY_CATEGORY_LABELS,
  TYPE_LABELS,
} from '../../types/domain';
import { maskIdentifiersInText } from '../../utils/privacy';
import { AI_FAILURE_NOTES, type AiFailure, type AiReading } from './reading';

/** A field Claude read and was sure of. */
const SURE = 0.95;
/** A field Claude, or a disagreement with the rules, left in doubt: below the review line. */
const UNSURE = 0.55;
/** A category is a good guess, never an unsure one: one tap to change (as in the engine). */
const CATEGORY_CONFIDENCE = 0.8;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const money = (n: number) => `${DEFAULT_CURRENCY} ${formatAmount(n)}`;
const cents = (n: number) => Math.round(n * 100) / 100;

/** "counterparty", "counterparty and date", "fee, counterparty and date". */
const listOf = (items: readonly string[]) =>
  items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

/** "2026-03-12" → "12 Mar 2026", the way the rules write dates. */
export function writtenDate(iso: string | null): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > new Date(year, month, 0).getDate()) return null;
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1]} ${year}`;
}

/** "Claude Haiku 4.5", from the model id the function reports. */
export function modelName(model: string): string {
  const m = /claude-(haiku|sonnet|opus)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(model);
  if (!m) return 'Claude';
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Claude ${family} ${m[2]}${m[3] ? `.${m[3]}` : ''}`;
}

const agree = (a: number | null, b: number | null) =>
  a == null || b == null || Math.abs(a - b) < 0.005;

export function readWithAi(rules: ParseResult, ai: AiReading, model: string): ParseResult {
  const unsure = new Set<string>(ai.unsure);
  const warnings: string[] = [];
  const ruleConfidence = (key: string) => rules.fields.find((f) => f.key === key)?.confidence ?? 0;

  // Where both read a figure, a difference sends it to review.
  const check = (key: string, label: string, fromRules: number | null, fromAi: number | null) => {
    if (agree(fromRules, fromAi) || ruleConfidence(key) < 0.75) return;
    unsure.add(key);
    warnings.push(`The AI and the on-phone rules read the ${label} differently. Check it.`);
  };
  check('amount', 'amount', rules.amount, ai.amount);
  check('fee', 'fee', rules.fee, ai.fee);
  check('balance', 'balance', rules.balanceAfter, ai.balanceAfter);
  const disagreed = warnings.length > 0;

  const category = ai.category;
  // A failed or pending payment names a money category but moved no money.
  const type = ai.isMoney ? CATEGORY_TO_TYPE[category] : 'UNKNOWN';
  const amount = ai.amount ?? rules.amount;
  const fee = ai.fee ?? rules.fee;
  const taxes = ai.taxes.length > 0 ? ai.taxes : rules.taxes;
  const taxTotal = cents(taxes.reduce((sum, t) => sum + t.amount, 0));
  // Numbers the phone didn't mask (no telling word before them) are masked now.
  const counterparty = ai.counterparty
    ? maskIdentifiersInText(ai.counterparty)
    : rules.counterparty;
  const masked =
    rules.maskedAccountOrPhone ??
    (ai.counterpartyNumber ? maskIdentifiersInText(ai.counterpartyNumber) : null);
  const reference = ai.reference ?? rules.transactionReference;
  const balance = ai.balanceAfter ?? rules.balanceAfter;
  const date = writtenDate(ai.date) ?? rules.transactionDate;
  const time = ai.time ?? rules.transactionTime;
  // A sender the registry knows keeps the registry's name and id.
  const provider = rules.provider ?? ai.provider;
  const moneyCategory = ai.isMoney ? (ai.moneyCategory ?? rules.moneyCategory) : null;

  const confidenceOf = (key: string, value: unknown, fromAi: boolean) =>
    value == null || value === ''
      ? 0
      : unsure.has(key)
        ? UNSURE
        : fromAi
          ? SURE
          : ruleConfidence(key);

  const fields: ParsedField[] = [
    buildField(
      'category',
      'Type',
      category,
      `${category.replace(/_/g, ' ')} - ${TYPE_LABELS[type]}`,
      unsure.has('category') ? UNSURE : SURE,
    ),
    buildField(
      'moneyCategory',
      'Category',
      moneyCategory,
      moneyCategory ? MONEY_CATEGORY_LABELS[moneyCategory] : 'Not set',
      moneyCategory ? (unsure.has('moneyCategory') ? UNSURE : CATEGORY_CONFIDENCE) : 0,
    ),
    buildField(
      'provider',
      'Provider',
      provider,
      provider ?? 'Not recognized',
      confidenceOf('provider', provider, rules.provider == null),
    ),
    buildField(
      'amount',
      'Amount',
      amount,
      amount == null ? 'Missing' : money(amount),
      confidenceOf('amount', amount, ai.amount != null),
    ),
    buildField(
      'fee',
      'Fee as stated',
      fee,
      fee == null ? 'None stated' : money(fee),
      confidenceOf('fee', fee, ai.fee != null),
    ),
    buildField(
      'taxes',
      'Taxes',
      taxes.length > 0 ? taxTotal : null,
      taxes.length > 0 ? describeTaxes(taxes) : 'None stated',
      confidenceOf('taxes', taxes.length > 0 ? taxTotal : null, ai.taxes.length > 0),
    ),
    buildField(
      'counterparty',
      'Counterparty',
      counterparty,
      counterparty ?? 'Not found',
      confidenceOf('counterparty', counterparty, ai.counterparty != null),
    ),
    buildField(
      'masked',
      'Account / phone',
      masked,
      masked ?? 'Not found',
      confidenceOf('masked', masked, rules.maskedAccountOrPhone == null),
    ),
    buildField(
      'reference',
      'Reference',
      reference,
      reference ?? 'Not found',
      confidenceOf('reference', reference, ai.reference != null),
    ),
    buildField(
      'balance',
      'Balance after',
      balance,
      balance == null ? 'Not found' : money(balance),
      confidenceOf('balance', balance, ai.balanceAfter != null),
    ),
    buildField(
      'date',
      'Date',
      date,
      date ? `${date}${time ? ` - ${time}` : ''}` : 'Not found',
      confidenceOf('date', date, ai.date != null),
    ),
    // A LUKU receipt's units, meter and token: the rules' own reading.
    ...rules.fields.filter((f) => ['units', 'meter', 'token'].includes(f.key)),
  ];

  if (ai.isMoney && amount == null) warnings.push('No amount found.');
  if (ai.isMoney && reference == null) {
    warnings.push(
      'No transaction reference found - only the exact same message is caught as a repeat.',
    );
  }
  if (ai.isMoney && date == null) {
    warnings.push('No date in the message - capture time will be used instead.');
  }
  const doubtful = ai.unsure.flatMap(
    (key) => fields.find((f) => f.key === key)?.label.toLowerCase() ?? [],
  );
  if (ai.isMoney && doubtful.length > 0) {
    warnings.push(
      `Check the ${listOf(doubtful)}: the AI wasn't sure of ${doubtful.length === 1 ? 'it' : 'them'}.`,
    );
  }

  // Earned only by what the message states and how well the two readers
  // agree: being read by Claude is worth nothing on its own.
  const factors = [
    { label: 'Amount stated', hit: amount != null, weight: 0.4 },
    { label: 'Agrees with the on-phone rules', hit: !disagreed, weight: 0.25 },
    { label: 'Nothing the AI was unsure of', hit: ai.unsure.length === 0, weight: 0.15 },
    { label: 'Reference found', hit: reference != null, weight: 0.1 },
    { label: 'Date found', hit: date != null, weight: 0.08 },
  ];
  const scored = Math.min(
    CONFIDENCE_MAX,
    factors.filter((f) => f.hit).reduce((sum, f) => sum + f.weight, 0),
  );
  const confidence = cents(ai.isMoney ? scored : Math.min(scored, NON_TRANSACTIONAL_CAP));

  return {
    ...rules,
    category,
    type,
    provider,
    providerId: rules.providerId,
    amount,
    currency: amount == null ? null : (ai.currency ?? DEFAULT_CURRENCY),
    counterparty,
    maskedAccountOrPhone: masked,
    transactionReference: reference,
    balanceAfter: balance,
    transactionDate: date,
    transactionTime: time,
    moneyCategory,
    fee,
    taxes,
    details: {
      ...rules.details,
      merchant: ai.merchant || rules.details.merchant,
      network: ai.network ?? rules.details.network,
    },
    confidence,
    band: bandFor(confidence),
    parserId: `${modelName(model)} + on-phone rules check`,
    warnings,
    reasons: [
      `Read by ${modelName(model)}, with phone and account numbers masked on this phone first`,
    ],
    factors,
    fields,
  };
}

/** The rules' own reading, saying why the AI didn't read it. */
export const rulesWithNote = (rules: ParseResult, failure: AiFailure): ParseResult => ({
  ...rules,
  warnings: [AI_FAILURE_NOTES[failure], ...rules.warnings],
});
