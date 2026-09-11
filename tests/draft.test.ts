import {
  buildLabSave,
  EDITED_CONFIDENCE_FLOOR,
  editModeFor,
  EMPTY_EDITS,
  LAB_SAVE_ERRORS,
  parseMoneyInput,
  viewDraft,
  type DraftEdits,
} from '../features/lab/draft';
import { parseMessage, SAMPLES } from '../features/parser';

const parse = (i: number) => parseMessage(SAMPLES[i].text, { sender: SAMPLES[i].sender });
const edits = (text: DraftEdits['text'], type?: DraftEdits['type']): DraftEdits => ({
  text,
  type,
});

// Sample indexes, named for readability.
const RECEIVED = 0; // mobile money, every field clean
const BANK_ATM = 2; // counterparty found only weakly
const PROMO = 3; // no amount at all

describe('parseMoneyInput', () => {
  it.each([
    ['45000', 45000],
    ['45,000', 45000],
    ['45,000.50', 45000.5],
    ['TZS 1,200', 1200],
    ['tsh 900', 900],
    ['  250000 ', 250000],
  ])('reads %p as %p', (raw, value) => {
    expect(parseMoneyInput(raw)).toEqual({ ok: true, value });
  });

  it('treats an empty box as no value', () => {
    expect(parseMoneyInput('   ')).toEqual({ ok: true, value: null });
  });

  it.each(['abc', '45k', '1.234', '-500', '4 5000', '12.'])('rejects %p', (raw) => {
    expect(parseMoneyInput(raw)).toEqual({ ok: false });
  });
});

describe('editModeFor', () => {
  it('uses a picker for the type, text for values, and nothing for the masked number', () => {
    expect(editModeFor('category')).toBe('type');
    expect(editModeFor('amount')).toBe('text');
    expect(editModeFor('reference')).toBe('text');
    expect(editModeFor('masked')).toBe('none');
  });
});

describe('viewDraft', () => {
  it('passes an unedited result through unchanged', () => {
    const r = parse(RECEIVED);
    const view = viewDraft(r, EMPTY_EDITS);

    expect(view.edited).toBe(false);
    expect(view.confidence).toBe(r.confidence);
    expect(view.fields.map((f) => f.value)).toEqual(r.fields.map((f) => f.value));
  });

  it('flags the weak counterparty on the bank sample', () => {
    const view = viewDraft(parse(BANK_ATM), EMPTY_EDITS);
    expect(view.remainingLow).toContain('counterparty');
    expect(view.willNeedReview).toBe(true);
  });

  it('marks an edited field verified and no longer low', () => {
    const view = viewDraft(parse(BANK_ATM), edits({ counterparty: 'CITY ATM' }));
    const field = view.fields.find((f) => f.key === 'counterparty')!;

    expect(field).toMatchObject({ value: 'CITY ATM', verified: true, low: false, confidence: 1 });
    expect(view.remainingLow).not.toContain('counterparty');
  });

  it('trusts a corrected record at least as much as the design floor', () => {
    const view = viewDraft(parse(BANK_ATM), edits({ counterparty: 'CITY ATM' }));
    expect(view.confidence).toBeGreaterThanOrEqual(EDITED_CONFIDENCE_FLOOR);
    expect(view.band).toBe('Very high');
  });

  it('formats an edited amount as money', () => {
    const view = viewDraft(parse(RECEIVED), edits({ amount: '60,000' }));
    expect(view.amount).toBe(60000);
    expect(view.fields.find((f) => f.key === 'amount')!.display).toBe('TZS 60,000');
  });

  it('holds no amount while the typed one is not a number yet', () => {
    const view = viewDraft(parse(RECEIVED), edits({ amount: '60k' }));
    expect(view.amount).toBeNull();
  });

  it('applies a picked type to the Type field and the direction', () => {
    const view = viewDraft(parse(RECEIVED), edits({}, 'SENT'));
    expect(view.type).toBe('SENT');
    expect(view.direction).toBe('out');
    expect(view.fields.find((f) => f.key === 'category')).toMatchObject({
      display: 'Sent',
      verified: true,
    });
  });
});

describe('buildLabSave', () => {
  it('confirms a clean record the user looked at', () => {
    const save = buildLabSave(parse(RECEIVED), EMPTY_EDITS);
    expect(save).toMatchObject({ ok: true, status: 'CONFIRMED', editedKeys: [] });
    if (save.ok) expect(save.values.amount).toBe(250000);
  });

  it('sends a record with an untouched unsure field to review', () => {
    const save = buildLabSave(parse(BANK_ATM), EMPTY_EDITS);
    expect(save).toMatchObject({
      ok: true,
      status: 'NEEDS_REVIEW',
      remainingLow: ['counterparty'],
    });
  });

  it('confirms it once the user fixes that field', () => {
    const save = buildLabSave(parse(BANK_ATM), edits({ counterparty: 'CITY ATM' }));
    expect(save).toMatchObject({ ok: true, status: 'CONFIRMED', editedKeys: ['counterparty'] });
    if (save.ok) {
      expect(save.values.counterparty).toBe('CITY ATM');
      expect(save.confidence).toBeGreaterThanOrEqual(EDITED_CONFIDENCE_FLOOR);
    }
  });

  it('refuses to save without an amount', () => {
    expect(buildLabSave(parse(PROMO), EMPTY_EDITS)).toEqual({
      ok: false,
      error: LAB_SAVE_ERRORS.noAmount,
      field: 'amount',
    });
  });

  it('accepts an amount the user supplies', () => {
    const save = buildLabSave(parse(PROMO), edits({ amount: '5,000' }));
    expect(save.ok).toBe(true);
    if (save.ok) expect(save.values.amount).toBe(5000);
  });

  it.each([
    ['abc', LAB_SAVE_ERRORS.badAmount],
    ['0', LAB_SAVE_ERRORS.zeroAmount],
  ])('rejects an amount of %p', (amount, error) => {
    expect(buildLabSave(parse(RECEIVED), edits({ amount }))).toMatchObject({ ok: false, error });
  });

  it('rejects a non-numeric balance but allows clearing it', () => {
    expect(buildLabSave(parse(RECEIVED), edits({ balance: 'lots' }))).toMatchObject({
      ok: false,
      error: LAB_SAVE_ERRORS.badBalance,
    });

    const cleared = buildLabSave(parse(RECEIVED), edits({ balance: '' }));
    expect(cleared.ok && cleared.values.balanceAfter).toBeNull();
  });

  it('drops the detected provider id when the name is retyped', () => {
    const save = buildLabSave(parse(RECEIVED), edits({ provider: 'My Bank' }));
    expect(save.ok && save.values).toMatchObject({ provider: 'My Bank', providerId: null });
  });

  it('treats a reference cleared to blank as no reference', () => {
    const save = buildLabSave(parse(RECEIVED), edits({ reference: '   ' }));
    expect(save.ok && save.values.transactionReference).toBeNull();
  });

  it('records a type change as an edit to the Type field', () => {
    const save = buildLabSave(parse(RECEIVED), edits({}, 'DEPOSIT'));
    expect(save).toMatchObject({ ok: true, editedKeys: ['category'] });
    expect(save.ok && save.values.type).toBe('DEPOSIT');
  });

  it('never carries the account or phone number in its values', () => {
    const save = buildLabSave(parse(RECEIVED), EMPTY_EDITS);
    expect(JSON.stringify(save)).not.toContain('0712345678');
  });
});
