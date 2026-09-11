/**
 * The Lab's draft: a parse result plus the user's corrections, before it is
 * saved.
 *
 * Pure functions only. The Lab store holds the state, the Result screen renders
 * `viewDraft`, and saving goes through `buildLabSave`, so the rules about what
 * an edit means are tested once instead of being re-derived in a component.
 */
import { bandFor, type ParsedField, type ParseResult } from '../parser';
import { REVIEW_THRESHOLD } from '../transactions/model';
import { isIncoming, isOutgoing, TYPE_LABELS, type TransactionType } from '../../types/domain';
import { formatTzs } from '../../utils/format';

/** Fields the user can type into on the Result screen. */
export const TEXT_EDITABLE_KEYS = [
  'amount',
  'counterparty',
  'provider',
  'reference',
  'balance',
  'date',
] as const;
export type TextEditableKey = (typeof TEXT_EDITABLE_KEYS)[number];

const MONEY_KEYS: readonly string[] = ['amount', 'balance'];

export const isTextEditable = (key: string): key is TextEditableKey =>
  (TEXT_EDITABLE_KEYS as readonly string[]).includes(key);

/**
 * How a field can be changed.
 *
 * `type` is picked from a list: free text could not be mapped back to a
 * transaction type (the design's free-text box for it is silently ignored on
 * save). `none` is account/phone, which is only ever held masked; a text box
 * would invite typing a full number back in.
 */
export type EditMode = 'text' | 'type' | 'none';

export const editModeFor = (key: string): EditMode =>
  key === 'category' ? 'type' : isTextEditable(key) ? 'text' : 'none';

export interface DraftEdits {
  /** Only keys whose value differs from what the parser found. */
  text: Partial<Record<TextEditableKey, string>>;
  /** Present only when it differs from the parsed type. */
  type?: TransactionType;
}

export const EMPTY_EDITS: DraftEdits = { text: {} };

export type MoneyInput = { ok: true; value: number | null } | { ok: false };

/**
 * Read a typed amount: "45000", "45,000", "45,000.50", "TZS 45,000".
 * Empty means "no value". Anything else unparseable is rejected, not guessed.
 */
export function parseMoneyInput(raw: string): MoneyInput {
  const trimmed = raw.trim().replace(/^(TZS|TSH)\s*/i, '');
  if (!trimmed) return { ok: true, value: null };
  const digits = trimmed.replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(digits)) return { ok: false };
  return { ok: true, value: Number(digits) };
}

/** A user-corrected record is trusted at least this much: the design's rule. */
export const EDITED_CONFIDENCE_FLOOR = 0.95;

export interface DraftFieldView extends ParsedField {
  editMode: EditMode;
  numeric: boolean;
}

export interface DraftView {
  fields: DraftFieldView[];
  type: TransactionType;
  direction: 'in' | 'out' | 'none';
  /** Null when missing, or while a typed amount is not yet a number. */
  amount: number | null;
  counterparty: string | null;
  provider: string | null;
  edited: boolean;
  confidence: number;
  band: ReturnType<typeof bandFor>;
  /** Keys still flagged as unsure after the user's edits. */
  remainingLow: string[];
  /** Whether saving now would go to the review queue instead of confirmed. */
  willNeedReview: boolean;
}

const editedText = (edits: DraftEdits, key: TextEditableKey, fallback: string | null) => {
  const v = edits.text[key];
  return v === undefined ? fallback : v.trim() || null;
};

function applyTextEdit(field: ParsedField, value: string): ParsedField {
  const trimmed = value.trim();
  let display = trimmed || (field.key === 'amount' ? 'Missing' : 'Not found');

  if (trimmed && MONEY_KEYS.includes(field.key)) {
    const money = parseMoneyInput(value);
    if (money.ok && money.value != null) display = formatTzs(money.value);
  }

  return {
    ...field,
    value,
    display,
    confidence: 1,
    low: false,
    missing: !trimmed,
    verified: true,
  };
}

export function viewDraft(result: ParseResult, edits: DraftEdits): DraftView {
  const type = edits.type ?? result.type;

  const fields: DraftFieldView[] = result.fields.map((field) => {
    let next: ParsedField = field;
    const textEdit = isTextEditable(field.key) ? edits.text[field.key] : undefined;

    if (field.key === 'category' && edits.type) {
      next = {
        ...field,
        value: edits.type,
        display: TYPE_LABELS[edits.type],
        confidence: 1,
        low: false,
        missing: false,
        verified: true,
      };
    } else if (textEdit !== undefined) {
      next = applyTextEdit(field, textEdit);
    }

    return { ...next, editMode: editModeFor(field.key), numeric: MONEY_KEYS.includes(field.key) };
  });

  let amount = result.amount;
  if (edits.text.amount !== undefined) {
    const m = parseMoneyInput(edits.text.amount);
    amount = m.ok ? m.value : null;
  }

  const edited = Object.keys(edits.text).length > 0 || edits.type !== undefined;
  const confidence = edited
    ? Math.max(result.confidence, EDITED_CONFIDENCE_FLOOR)
    : result.confidence;
  const remainingLow = fields.filter((f) => f.low).map((f) => f.key);

  return {
    fields,
    type,
    direction: isIncoming(type) ? 'in' : isOutgoing(type) ? 'out' : 'none',
    amount,
    counterparty: editedText(edits, 'counterparty', result.counterparty),
    provider: editedText(edits, 'provider', result.provider),
    edited,
    confidence,
    band: bandFor(confidence),
    remainingLow,
    willNeedReview: remainingLow.length > 0 || confidence < REVIEW_THRESHOLD,
  };
}

export interface LabValues {
  type: TransactionType;
  amount: number;
  counterparty: string | null;
  provider: string | null;
  providerId: string | null;
  transactionReference: string | null;
  balanceAfter: number | null;
  transactionDate: string | null;
  transactionTime: string | null;
}

export type LabSave =
  | {
      ok: true;
      values: LabValues;
      /** Which fields the user changed. Recorded; their values are not. */
      editedKeys: string[];
      remainingLow: string[];
      confidence: number;
      status: 'CONFIRMED' | 'NEEDS_REVIEW';
    }
  | { ok: false; error: string; field: string };

export type LabSaveReady = Extract<LabSave, { ok: true }>;

export const LAB_SAVE_ERRORS = {
  noAmount: 'Add an amount before saving.',
  badAmount: 'Amount must be a number, like 45,000.',
  zeroAmount: 'Amount must be more than zero.',
  badBalance: 'Balance must be a number, like 133,900, or left empty.',
} as const;

/**
 * Turn a draft into values a transaction can be saved with.
 *
 * Status is decided here, not by the caller. A record the user has looked at
 * is CONFIRMED only when nothing in it is still flagged as unsure; otherwise it
 * goes to the review queue. The design confirms anything scoring 0.6 or more,
 * but the brief is explicit that low-confidence data is never treated as
 * verified, and the user never touched those fields.
 */
export function buildLabSave(result: ParseResult, edits: DraftEdits): LabSave {
  let amount = result.amount;
  if (edits.text.amount !== undefined) {
    const m = parseMoneyInput(edits.text.amount);
    if (!m.ok) return { ok: false, error: LAB_SAVE_ERRORS.badAmount, field: 'amount' };
    amount = m.value;
  }
  if (amount == null) return { ok: false, error: LAB_SAVE_ERRORS.noAmount, field: 'amount' };
  if (amount <= 0) return { ok: false, error: LAB_SAVE_ERRORS.zeroAmount, field: 'amount' };

  let balance = result.balanceAfter;
  if (edits.text.balance !== undefined) {
    const m = parseMoneyInput(edits.text.balance);
    if (!m.ok) return { ok: false, error: LAB_SAVE_ERRORS.badBalance, field: 'balance' };
    balance = m.value;
  }

  const view = viewDraft(result, edits);
  const date = editedText(edits, 'date', result.transactionDate);

  return {
    ok: true,
    values: {
      type: view.type,
      amount,
      counterparty: editedText(edits, 'counterparty', result.counterparty),
      provider: editedText(edits, 'provider', result.provider),
      // A hand-typed provider name cannot be tied back to a detected id.
      providerId: edits.text.provider !== undefined ? null : result.providerId,
      transactionReference: editedText(edits, 'reference', result.transactionReference),
      balanceAfter: balance,
      transactionDate: date,
      transactionTime: date == null ? null : result.transactionTime,
    },
    editedKeys: [...Object.keys(edits.text), ...(edits.type ? ['category'] : [])],
    remainingLow: view.remainingLow,
    confidence: view.confidence,
    status: view.willNeedReview ? 'NEEDS_REVIEW' : 'CONFIRMED',
  };
}
