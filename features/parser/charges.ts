/**
 * Fees, taxes and receipt lines.
 *
 * Built from real Tanzanian layouts the user supplied (anonymized in
 * tests/fixtures/tz-messages.ts). In every mobile-money message the VAT sits
 * INSIDE the fee: "Ada TSh 495. VAT TSh 76" means 495 left the balance, and 76
 * of it was VAT (18% of the pre-tax 419). The balances in those messages
 * confirm it. A LUKU receipt is different: its VAT, EWURA and REA sit inside
 * the amount paid, and its lines add up to the TOTAL.
 *
 * Both are checked, so a misread figure is flagged rather than saved quietly.
 */
import { TAX_LABELS, type TaxCode } from '../../types/domain';
import { maskIdentifier, toNumber } from './extractors';
import type { TaxLine } from './schema';

const MONEY = String.raw`([\d,]+(?:\.\d{1,2})?)`;
const CURRENCY = String.raw`(?:TZS|TSH)\.?`;
const OPTIONAL_CURRENCY = String.raw`(?:(?:TZS|TSH)\.?\s*)?`;
const RATE = String.raw`(?:(\d{1,2}(?:\.\d+)?)\s*%\s*)?`;

/** Tanzania's standard VAT rate. */
export const VAT_RATE_PCT = 18;
/** Messages round VAT to the shilling. */
const VAT_TOLERANCE = 1;
/** Receipts itemise to the cent. */
const RECEIPT_TOLERANCE = 0.05;

export interface FeeMatch {
  value: number | null;
  /** How the message named it. */
  label: string | null;
  confidence: number;
}

const FEE_PATTERNS: [RegExp, string][] = [
  [
    new RegExp(String.raw`jumla ya makato\s*(?:ni\s*)?${CURRENCY}\s*${MONEY}`, 'i'),
    'Total charges',
  ],
  [
    new RegExp(String.raw`\bada ya kutoa\s*(?:ni\s*)?${CURRENCY}\s*${MONEY}`, 'i'),
    'Withdrawal fee',
  ],
  [new RegExp(String.raw`\bada\s*(?:ni\s*)?${CURRENCY}\s*${MONEY}`, 'i'), 'Fee'],
  [
    new RegExp(String.raw`\b(?:fee|charges?|transaction cost)\s*:?\s*${CURRENCY}\s*${MONEY}`, 'i'),
    'Fee',
  ],
];

/** What the transaction cost on top of the amount, as the message states it. */
export function extractFee(text: string): FeeMatch {
  for (const [pattern, label] of FEE_PATTERNS) {
    const m = pattern.exec(text);
    const value = m ? toNumber(m[1]) : null;
    if (value != null) return { value, label, confidence: 0.9 };
  }
  return { value: null, label: null, confidence: 0 };
}

const TAX_PATTERNS: [TaxCode, RegExp][] = [
  ['VAT', new RegExp(String.raw`\bVAT\b\s*${RATE}${OPTIONAL_CURRENCY}${MONEY}`, 'gi')],
  [
    'EXCISE',
    new RegExp(String.raw`\bexcise(?:\s+duty)?\b\s*${RATE}${OPTIONAL_CURRENCY}${MONEY}`, 'gi'),
  ],
  [
    'LEVY',
    new RegExp(
      String.raw`\b(?:tozo(?:\s+(?:la|ya)\s+serikali)?|government levy|levy)\b\s*${RATE}${OPTIONAL_CURRENCY}${MONEY}`,
      'gi',
    ),
  ],
  // Upper-case only: short acronyms must not match inside ordinary words.
  ['EWURA', new RegExp(String.raw`\bEWURA\b\s*${RATE}${OPTIONAL_CURRENCY}${MONEY}`, 'g')],
  ['REA', new RegExp(String.raw`\bREA\b\s*${RATE}${OPTIONAL_CURRENCY}${MONEY}`, 'g')],
];

/**
 * Every tax line in the message. Where each sits is decided from context and
 * then checked by `checkCharges`: inside the amount on a receipt, inside the
 * fee when there is one, otherwise inside the amount.
 */
export function extractTaxes(
  text: string,
  context: { hasFee: boolean; receipt: boolean },
): TaxLine[] {
  const within: TaxLine['within'] = context.receipt ? 'amount' : context.hasFee ? 'fee' : 'amount';
  const lines: TaxLine[] = [];

  for (const [code, pattern] of TAX_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const amount = toNumber(m[2]);
      if (amount == null) continue;
      lines.push({ code, amount, ratePct: m[1] ? Number(m[1]) : null, within });
    }
  }
  return lines;
}

export interface ElectricityReceipt {
  total: number | null;
  /** The price of the units before tax ("Cost"). */
  netCost: number | null;
  units: string | null;
  /** Masked. */
  meterNumber: string | null;
  /** Grouped in fours, as it is typed into the meter. */
  token: string | null;
  reference: string | null;
  debtCollected: number | null;
}

/**
 * A LUKU (prepaid electricity) receipt: units in kWh and an itemised TOTAL.
 * Null for anything else.
 */
export function extractElectricityReceipt(text: string): ElectricityReceipt | null {
  const units = /(\d+(?:\.\d+)?)\s*kwh\b/i.exec(text);
  const total = new RegExp(String.raw`\bTOTAL\b\s*${OPTIONAL_CURRENCY}${MONEY}`, 'i').exec(text);
  if (!units || !total) return null;

  const cost = new RegExp(String.raw`\bCost\b\s*${OPTIONAL_CURRENCY}${MONEY}`, 'i').exec(text);
  const debt = new RegExp(
    String.raw`\bDebt(?:\s+Collected)?\b\s*${OPTIONAL_CURRENCY}${MONEY}`,
    'i',
  ).exec(text);
  const token = /\b(\d{4}(?:[ -]\d{4}){4})\b/.exec(text) ?? /\b(\d{20})\b/.exec(text);
  // A TANESCO meter number is 11 digits; the receipt reference is longer.
  const meter = /\b(\d{11})\b/.exec(text);
  const reference = /\b(\d{16,19})\b/.exec(text);

  return {
    total: toNumber(total[1]),
    netCost: cost ? toNumber(cost[1]) : null,
    units: `${units[1]} kWh`,
    meterNumber: meter ? maskIdentifier(meter[1]) : null,
    token: token ? token[1].replace(/\D/g, '').replace(/(\d{4})(?=\d)/g, '$1 ') : null,
    reference: reference ? reference[1] : null,
    debtCollected: debt ? toNumber(debt[1]) : null,
  };
}

export interface ChargeCheck {
  /** The tax lines, with `within` corrected where the arithmetic says so. */
  taxes: TaxLine[];
  /** Shown in "How we got this". */
  reasons: string[];
  warnings: string[];
  /** How far the tax figures can be trusted: low when they do not add up. */
  taxConfidence: number;
}

const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;

/**
 * Check the message's own arithmetic. A fee's VAT must be 18% of it, either
 * already inside (the usual case) or on top; a receipt's lines must add up to
 * its total, and each tax must match its stated rate.
 */
export function checkCharges(input: {
  fee: number | null;
  taxes: TaxLine[];
  receipt: ElectricityReceipt | null;
}): ChargeCheck {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let taxes = input.taxes;
  const { fee, receipt } = input;

  const vat = taxes.find((t) => t.code === 'VAT' && t.within === 'fee');
  if (fee != null && vat) {
    const inside = (fee * VAT_RATE_PCT) / (100 + VAT_RATE_PCT);
    const onTop = (fee * VAT_RATE_PCT) / 100;
    if (near(vat.amount, inside, VAT_TOLERANCE)) {
      reasons.push('VAT is 18% of the fee, already included in it');
    } else if (near(vat.amount, onTop, VAT_TOLERANCE)) {
      taxes = taxes.map((t) => (t === vat ? { ...t, within: 'extra' as const } : t));
      reasons.push('VAT is 18% charged on top of the fee');
    } else {
      warnings.push('The VAT does not match 18% of the fee. Check the fee and the VAT.');
    }
  }

  if (receipt?.total != null && receipt.netCost != null) {
    const netCost = receipt.netCost;
    const sum = netCost + taxes.reduce((s, t) => s + t.amount, 0) + (receipt.debtCollected ?? 0);
    if (near(sum, receipt.total, RECEIPT_TOLERANCE)) {
      reasons.push('Receipt lines add up to the total');
    } else {
      warnings.push('The receipt lines do not add up to the total. Check the amounts.');
    }

    const rated = taxes.filter((t) => t.ratePct != null);
    const off = rated.filter(
      (t) => !near((netCost * (t.ratePct ?? 0)) / 100, t.amount, RECEIPT_TOLERANCE),
    );
    if (off.length > 0) {
      warnings.push(
        `${off.map((t) => TAX_LABELS[t.code]).join(', ')} does not match its stated rate.`,
      );
    } else if (rated.length > 0) {
      reasons.push('Each tax matches its stated rate');
    }
  }

  return { taxes, reasons, warnings, taxConfidence: warnings.length > 0 ? 0.6 : 0.9 };
}
