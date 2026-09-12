/**
 * What the money was for: the rules that pick a category, and remembering the
 * user's own choice for a recipient.
 *
 * The rules look at the counterparty, which is where a merchant or biller's
 * name lands ("HELABET", "TOTALENERGIES - ... SERVICE STATION", "LUKU"), plus
 * a few unmistakable words in the message itself. A correction always wins
 * and is remembered, so the next message to the same recipient gets it too.
 */
import {
  MONEY_CATEGORY_LABELS,
  type MoneyCategory,
  type TransactionType,
} from '../../types/domain';
import type { ParseResult } from './schema';

export interface CategoryClues {
  type: TransactionType;
  counterparty: string | null;
  /** Normalized message text, when there is one. */
  text?: string;
  /** Paid to a merchant (Lipa number or named business) rather than a person. */
  merchant?: boolean;
  /** A LUKU electricity receipt. */
  electricity?: boolean;
}

/** Checked against the counterparty, in order. */
const PARTY_RULES: [RegExp, MoneyCategory][] = [
  [/\b(luku|umeme|tanesco|dawasa|ruwasa|maji|water)\b/i, 'ELECTRICITY_WATER'],
  [
    /\b(helabet|sportpesa|sport pesa|betway|betpawa|meridian ?bet|m-?bet|premier ?bet|gal ?sport|parimatch|odibet|wasafi ?bet|bet)\b/i,
    'BETTING',
  ],
  [
    /\b(totalenergies|total energies|puma|oryx|gapco|lake oil|camel oil|petrol|diesel|fuel|service station|uber|bolt|latra|sgr|atcl|daladala)\b/i,
    'FUEL_TRANSPORT',
  ],
  [/\b(bando|bundle|data|airtime)\b/i, 'AIRTIME_DATA'],
  [
    /\b(dstv|azam ?tv|startimes|zuku|gepg|tra|nhif|nssf|bima|insurance|school|shule|internet|wifi)\b/i,
    'BILLS_SERVICES',
  ],
  [
    /\b(supermarket|shop|shoppers|duka|market|soko|restaurant|hotel|cafe|bakery|pharmacy|food|chakula)\b/i,
    'FOOD_SHOPPING',
  ],
];

const SALARY = /\b(payroll|mshahara|salary|salaries)\b/i;
const BUSINESS = /\b(mauzo|sales|biashara)\b/i;
const ELECTRICITY_TEXT = /\d\s*kwh\b|\b(luku|umeme|tanesco)\b/i;
const AIRTIME_TEXT = /\b(bando|bundle|muda wa maongezi)\b/i;

/** The rule-picked category, or null for a message that is not a transaction. */
export function inferMoneyCategory(clues: CategoryClues): MoneyCategory | null {
  const party = clues.counterparty ?? '';
  const text = clues.text ?? '';

  switch (clues.type) {
    case 'UNKNOWN':
      return null;
    case 'AIRTIME':
      return 'AIRTIME_DATA';
    case 'WITHDRAWAL':
      return 'CASH_WITHDRAWAL';
    case 'RECEIVED':
    case 'DEPOSIT':
      if (SALARY.test(party) || SALARY.test(text)) return 'SALARY';
      if (clues.type === 'DEPOSIT') return 'OTHER_INCOME';
      if (clues.merchant || BUSINESS.test(text)) return 'BUSINESS';
      return party ? 'RECEIVED_FROM_PEOPLE' : 'OTHER_INCOME';
    default:
      if (clues.electricity || ELECTRICITY_TEXT.test(text)) return 'ELECTRICITY_WATER';
      for (const [pattern, category] of PARTY_RULES) {
        if (pattern.test(party)) return category;
      }
      if (AIRTIME_TEXT.test(text)) return 'AIRTIME_DATA';
      if (clues.merchant) return 'FOOD_SHOPPING';
      if (clues.type === 'BILL_PAYMENT') return 'BILLS_SERVICES';
      return party ? 'SENT_TO_PEOPLE' : 'OTHER_SPENDING';
  }
}

/** How a recipient is recognised again: case, spacing and punctuation ignored. */
export function partyKey(counterparty: string | null | undefined): string | null {
  const key = (counterparty ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
  return key || null;
}

/** Apply the user's remembered choice for this recipient, when there is one. */
export function applyRememberedCategory(
  result: ParseResult,
  rules: Readonly<Record<string, MoneyCategory>>,
): ParseResult {
  const key = partyKey(result.counterparty);
  const remembered = key ? rules[key] : undefined;
  if (!remembered || remembered === result.moneyCategory) return result;

  return {
    ...result,
    moneyCategory: remembered,
    reasons: [...result.reasons, 'Category remembered from your earlier choice for this recipient'],
    fields: result.fields.map((f) =>
      f.key === 'moneyCategory'
        ? {
            ...f,
            value: remembered,
            display: MONEY_CATEGORY_LABELS[remembered],
            confidence: 1,
            low: false,
            missing: false,
          }
        : f,
    ),
  };
}
