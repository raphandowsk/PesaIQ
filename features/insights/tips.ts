/**
 * Tips drawn from the user's own records, ported from the design's rules.
 *
 * Where the design's copy made a promise the app cannot keep, or broke on a
 * count of one, the wording is corrected here. Every change is noted beside it.
 */
import type { Transaction } from '../transactions/model';
import { isCounted } from '../transactions/selectors';
import { MONEY_CATEGORY_LABELS } from '../../types/domain';
import { formatAmount } from '../../utils/format';
import type { CategoryBreakdown } from './categories';
import type { Health } from './health';

export interface Tip {
  title: string;
  body: string;
  /** The figure the tip is based on, so it never reads as generic advice. */
  why: string;
}

/** The design's triggers. */
export const TIP_THRESHOLDS = {
  /** Cash above this share of spending earns the ATM tip. */
  cashShare: 0.12,
  /** Keeping less than this share of income earns the savings tip. */
  keepTarget: 0.35,
  /** "One source carries most of it" only once one source is a majority. */
  majority: 0.5,
} as const;

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tzs = (n: number) => `TZS ${formatAmount(n)}`;
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Category names lead sentences; the design lowercased them. */
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Empty when nothing has been spent: there is nothing to advise on. */
export function spendTips(health: Health, spend: CategoryBreakdown): Tip[] {
  if (spend.rows.length === 0) return [];

  const tips: Tip[] = [];
  // Against what was spent, like the category breakdown beside it. Fees and
  // taxes are shown on their own card.
  const cashShare = health.spent > 0 ? health.cash / health.spent : 0;
  const cashTip = cashShare > TIP_THRESHOLDS.cashShare;

  if (cashTip) {
    tips.push({
      title: 'Cut down ATM trips',
      body: `Cash is ${pct(cashShare)} of what you spend. Withdraw larger amounts less often, since every withdrawal carries its own fee.`,
      why: `${tzs(health.cash)} taken out as cash`,
    });
  }

  // Cash already has its own tip, so the cap goes on the next biggest category.
  const capTarget = spend.rows.find(
    (r) => r.name !== MONEY_CATEGORY_LABELS.CASH_WITHDRAWAL || !cashTip,
  );
  if (capTarget) {
    tips.push({
      title: 'Set a weekly cap',
      // The design adds "PesaIQ will tell you as you approach it". There is no
      // budget alert in PesaIQ, so the tip does not promise one.
      body: `${capitalize(capTarget.name)} is ${capTarget.pct}% of your spending. A weekly cap on this one category is the quickest place to start.`,
      why: `${tzs(capTarget.amount)} across ${count(capTarget.count, 'transaction', 'transactions')}`,
    });
  }

  if (health.savings < TIP_THRESHOLDS.keepTarget) {
    tips.push({
      title: `Aim to keep ${pct(TIP_THRESHOLDS.keepTarget)}`,
      body: `You currently keep ${pct(health.savings)} of what comes in. Move a share aside the moment a payment lands, before it gets spent.`,
      why: `${tzs(health.received)} in against ${tzs(health.sent)} out`,
    });
  }

  if (tips.length === 0) {
    tips.push({
      title: 'Your spending is steady',
      body: 'No single category dominates your spending. Keep saving every message so the trend stays visible.',
      why: `${tzs(health.spent)} spent`,
    });
  }

  return tips;
}

export function earnTips(
  health: Health,
  earn: CategoryBreakdown,
  transactions: readonly Transaction[],
): Tip[] {
  const records = transactions.filter(isCounted);
  const noReference = records.filter((t) => !t.transactionReference).length;
  const unconfirmed = records.filter((t) => t.status !== 'CONFIRMED').length;
  const top = earn.rows[0];
  const tips: Tip[] = [];

  // The design shows this whenever there is any income; "makes up most of your
  // income" is only true once one source is a majority.
  if (top && top.pct > TIP_THRESHOLDS.majority * 100) {
    tips.push({
      title: `One source carries ${top.pct}%`,
      body: `${capitalize(top.name)} makes up most of your income. A second source, however small, softens the month a payment arrives late.`,
      why: `${tzs(top.amount)} from ${top.name.toLowerCase()}`,
    });
  }

  if (noReference > 0) {
    tips.push({
      title: 'Ask for a reference every time',
      body: `${count(noReference, 'record carries', 'records carry')} no transaction number, so ${noReference === 1 ? 'it' : 'they'} cannot be verified or checked for duplicates. Ask for a reference whenever you are paid.`,
      why: `${count(noReference, 'record', 'records')} without a reference`,
    });
  }

  if (unconfirmed > 0) {
    tips.push({
      title: 'Clear the review queue',
      body: `${count(unconfirmed, 'record is', 'records are')} still unconfirmed, so your totals cannot be relied on yet. Two minutes of review fixes that.`,
      why: 'Your health score rises with every record confirmed',
    });
  }

  if (tips.length === 0 && top) {
    tips.push({
      title: 'Your income is traceable',
      body: 'Every record has a reference and has been confirmed. Hold that pattern and your records stay ready when you need to show them.',
      why: `${tzs(health.received)} received`,
    });
  }

  return tips;
}
