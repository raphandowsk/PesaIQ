/**
 * Viewing and correcting a saved record on its detail screen.
 *
 * Shares the Lab's money parsing and error wording, so "45,000" means the same
 * thing wherever it is typed. Account/phone stays read-only here too: it is
 * only ever held masked.
 */
import { LAB_SAVE_ERRORS, parseMoneyInput, type DraftFieldView } from '../lab/draft';
import { DEFAULT_CURRENCY, TYPE_LABELS, type TransactionType } from '../../types/domain';
import { formatTzs } from '../../utils/format';
import type { Transaction } from './model';

export const RECORD_EDITABLE_KEYS = [
  'amount',
  'counterparty',
  'provider',
  'reference',
  'balance',
  'date',
] as const;
export type RecordEditableKey = (typeof RECORD_EDITABLE_KEYS)[number];

export const isRecordEditable = (key: string): key is RecordEditableKey =>
  (RECORD_EDITABLE_KEYS as readonly string[]).includes(key);

export interface RecordEdits {
  /** What the user has typed, by field. */
  text: Partial<Record<RecordEditableKey, string>>;
  /** Present only when it differs from the saved type. */
  type?: TransactionType;
}

export const NO_RECORD_EDITS: RecordEdits = { text: {} };

/** A field's saved value, as the editor shows it. */
export function recordValue(t: Transaction, key: RecordEditableKey): string {
  switch (key) {
    case 'amount':
      return t.amount == null ? '' : String(t.amount);
    case 'counterparty':
      return t.counterparty ?? '';
    case 'provider':
      return t.provider ?? '';
    case 'reference':
      return t.transactionReference ?? '';
    case 'balance':
      return t.balanceAfter == null ? '' : String(t.balanceAfter);
    case 'date':
      return t.transactionDate ?? '';
  }
}

export interface RecordField {
  key: string;
  label: string;
  display: string;
  /** Flagged as unsure when it was parsed, and not corrected since. */
  low: boolean;
  missing: boolean;
}

/** The detail screen's rows, in the design's order. */
export function recordFields(t: Transaction): RecordField[] {
  const row = (key: string, label: string, value: string | null, empty = 'Not found') => ({
    key,
    label,
    display: value ?? empty,
    low: t.lowFields.includes(key),
    missing: value == null,
  });
  const date = t.transactionDate
    ? [t.transactionDate, t.transactionTime].filter(Boolean).join(' · ')
    : null;

  return [
    row('provider', 'Provider', t.provider),
    row('amount', 'Amount', t.amount == null ? null : formatTzs(t.amount), 'Missing'),
    row('counterparty', 'Counterparty', t.counterparty),
    row('masked', 'Account / phone', t.maskedAccountOrPhone),
    row('reference', 'Reference', t.transactionReference),
    row('balance', 'Balance after', t.balanceAfter == null ? null : formatTzs(t.balanceAfter)),
    row('date', 'Date', date),
  ];
}

/** The same rows as editors, with the type picker first. Feeds the Lab's FieldRow. */
export function recordEditViews(t: Transaction, edits: RecordEdits): DraftFieldView[] {
  const type = edits.type ?? t.type;

  const typeView: DraftFieldView = {
    key: 'category',
    label: 'Type',
    value: type,
    display: TYPE_LABELS[type],
    confidence: 1,
    low: t.lowFields.includes('category') && !edits.type,
    missing: false,
    verified: !!edits.type,
    editMode: 'type',
    numeric: false,
  };

  const fields = recordFields(t).map((f): DraftFieldView => {
    const editable = isRecordEditable(f.key);
    const typed = editable ? edits.text[f.key as RecordEditableKey] : undefined;
    const value = typed ?? (editable ? recordValue(t, f.key as RecordEditableKey) : '');
    return {
      key: f.key,
      label: f.label,
      value,
      display: f.display,
      confidence: 1,
      low: f.low && typed === undefined,
      missing: editable ? !value.trim() : f.missing,
      verified: typed !== undefined,
      editMode: editable ? 'text' : 'none',
      numeric: f.key === 'amount' || f.key === 'balance',
    };
  });

  return [typeView, ...fields];
}

/** Confirming says the record is right, and a record with no amount is not. */
export const canConfirm = (t: Transaction): boolean => t.amount != null && t.amount > 0;

export type RecordPatchResult =
  | {
      ok: true;
      patch: Partial<Transaction>;
      /** Which fields changed. Recorded; their values are not. */
      editedKeys: string[];
    }
  | { ok: false; error: string; field: string };

/**
 * Turn what the user typed into a patch. Only real changes count: a field
 * typed back to its saved value is not an edit.
 */
export function buildRecordPatch(t: Transaction, edits: RecordEdits): RecordPatchResult {
  const patch: Partial<Transaction> = {};
  const editedKeys: string[] = [];

  const changed = (key: RecordEditableKey): string | undefined => {
    const v = edits.text[key];
    return v !== undefined && v.trim() !== recordValue(t, key).trim() ? v : undefined;
  };

  const amountText = changed('amount');
  if (amountText !== undefined) {
    const m = parseMoneyInput(amountText);
    if (!m.ok) return { ok: false, error: LAB_SAVE_ERRORS.badAmount, field: 'amount' };
    if (m.value == null) return { ok: false, error: LAB_SAVE_ERRORS.noAmount, field: 'amount' };
    if (m.value <= 0) return { ok: false, error: LAB_SAVE_ERRORS.zeroAmount, field: 'amount' };
    patch.amount = m.value;
    patch.currency = DEFAULT_CURRENCY;
    editedKeys.push('amount');
  }
  if ((patch.amount ?? t.amount) == null) {
    return { ok: false, error: LAB_SAVE_ERRORS.noAmount, field: 'amount' };
  }

  const balanceText = changed('balance');
  if (balanceText !== undefined) {
    const m = parseMoneyInput(balanceText);
    if (!m.ok) return { ok: false, error: LAB_SAVE_ERRORS.badBalance, field: 'balance' };
    patch.balanceAfter = m.value;
    editedKeys.push('balance');
  }

  const counterparty = changed('counterparty');
  if (counterparty !== undefined) {
    patch.counterparty = counterparty.trim() || null;
    editedKeys.push('counterparty');
  }

  const reference = changed('reference');
  if (reference !== undefined) {
    patch.transactionReference = reference.trim() || null;
    editedKeys.push('reference');
  }

  const provider = changed('provider');
  if (provider !== undefined) {
    patch.provider = provider.trim() || null;
    // A hand-typed provider name cannot be tied back to a detected id.
    patch.providerId = null;
    editedKeys.push('provider');
  }

  const date = changed('date');
  if (date !== undefined) {
    patch.transactionDate = date.trim() || null;
    if (patch.transactionDate === null) patch.transactionTime = null;
    editedKeys.push('date');
  }

  if (edits.type && edits.type !== t.type) {
    patch.type = edits.type;
    editedKeys.push('category');
  }

  return { ok: true, patch, editedKeys };
}
