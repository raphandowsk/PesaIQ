/**
 * The Parser Lab's working state: what is in the paste box, the draft shown on
 * the Result screen, and the user's corrections to it.
 *
 * Ephemeral by design. Nothing here is persisted until `save()` hands over to
 * the app store, and it is kept apart from the app store so a Lab session never
 * mixes with saved records. The draft reaches the Result screen through here,
 * never through route params: SMS text does not belong in a URL.
 */
import { create } from 'zustand';

import { MAX_MESSAGE_LENGTH, type ParseResult, type SmsSample } from '../parser';
import type { Transaction } from '../transactions/model';
import { useAppStore, type SaveOutcome } from '../transactions/store';
import { transactionKey } from '../transactions/transactionKey';
import type { MoneyCategory, TransactionType } from '../../types/domain';
import { formatAmount } from '../../utils/format';
import {
  buildLabSave,
  draftCategory,
  draftKeyParts,
  EMPTY_EDITS,
  type DraftEdits,
  type TextEditableKey,
} from './draft';

export const LAB_ERRORS = {
  empty: 'Paste a message before analyzing.',
  tooLong: `Message is unusually long (over ${formatAmount(MAX_MESSAGE_LENGTH)} characters). Trim it and try again.`,
  failed: 'That message could not be analyzed. Nothing was saved.',
  noDraft: 'Nothing to save. Analyze a message first.',
  saveFailed: 'Could not save this record. Nothing was changed.',
} as const;

export type LabSaveResult = { ok: true; outcome: SaveOutcome } | { ok: false; error: string };

interface LabState {
  text: string;
  /** Sender id from a loaded sample; forgotten once the box is emptied. */
  sender?: string;
  /** Validation message for the paste box. */
  error: string | null;
  draft: ParseResult | null;
  edits: DraftEdits;
  editing: boolean;

  setText(text: string): void;
  loadSample(sample: SmsSample): void;
  clear(): void;
  /** Validate and parse. Returns false, with `error` set, when it cannot. */
  analyze(): Promise<boolean>;
  setEditing(editing: boolean): void;
  editField(key: TextEditableKey, value: string): void;
  setType(type: TransactionType): void;
  setMoneyCategory(category: MoneyCategory): void;
  save(): Promise<LabSaveResult>;
  /** The record already saved for this draft's transaction, if any: saving would be skipped. */
  findSaved(): Promise<Transaction | null>;
  /** "Not correct": record it, drop the draft, keep the text to try again. */
  reject(): Promise<void>;
  /** Drop the draft and the text. */
  discard(): void;
}

const NO_DRAFT = { draft: null, edits: EMPTY_EDITS, editing: false };

export const useLabStore = create<LabState>((set, get) => ({
  text: '',
  sender: undefined,
  error: null,
  ...NO_DRAFT,

  setText(text) {
    // A stale sample sender would bias provider detection for whatever the
    // user pastes next, so it goes when the box is emptied.
    set(text.trim() ? { text, error: null } : { text, error: null, sender: undefined });
  },

  loadSample(sample) {
    set({ text: sample.text, sender: sample.sender, error: null });
  },

  clear() {
    set({ text: '', sender: undefined, error: null });
  },

  async analyze() {
    const { text, sender } = get();

    // Checked here rather than by catching the engine's error classes, so the
    // message shown never depends on `instanceof` surviving the JS transform.
    if (!text.trim()) {
      set({ error: LAB_ERRORS.empty });
      return false;
    }
    if (text.trim().length > MAX_MESSAGE_LENGTH) {
      set({ error: LAB_ERRORS.tooLong });
      return false;
    }

    try {
      const draft = await useAppStore.getState().read(text, sender);
      set({ ...NO_DRAFT, draft, error: null });
      return true;
    } catch {
      set({ ...NO_DRAFT, error: LAB_ERRORS.failed });
      return false;
    }
  },

  setEditing(editing) {
    set({ editing });
  },

  editField(key, value) {
    const { draft, edits } = get();
    if (!draft) return;

    const original = draft.fields.find((f) => f.key === key)?.value ?? '';
    const text = { ...edits.text };
    // Typing a field back to what the parser found is not a correction.
    if (value === original) delete text[key];
    else text[key] = value;

    set({ edits: { ...edits, text } });
  },

  setType(type) {
    const { draft, edits } = get();
    if (!draft) return;
    set({ edits: { ...edits, type: type === draft.type ? undefined : type } });
  },

  setMoneyCategory(category) {
    const { draft, edits } = get();
    if (!draft) return;
    // Picking what would be chosen anyway is not a correction, so nothing is
    // remembered for it.
    const automatic = draftCategory(draft, { ...edits, moneyCategory: undefined });
    set({ edits: { ...edits, moneyCategory: category === automatic ? undefined : category } });
  },

  async save() {
    const { draft, edits } = get();
    if (!draft) return { ok: false, error: LAB_ERRORS.noDraft };

    const build = buildLabSave(draft, edits);
    if (!build.ok) return { ok: false, error: build.error };

    try {
      const outcome = await useAppStore.getState().saveFromLab(draft, build);
      set({ ...NO_DRAFT, text: '', sender: undefined, error: null });
      return { ok: true, outcome };
    } catch {
      return { ok: false, error: LAB_ERRORS.saveFailed };
    }
  },

  async findSaved() {
    const { draft, edits } = get();
    if (!draft) return null;
    try {
      const key = transactionKey(draftKeyParts(draft, edits), draft.normalizedText);
      return await useAppStore.getState().findSaved(key);
    } catch {
      // Only a hint for the screen; saving checks again.
      return null;
    }
  },

  async reject() {
    const { draft } = get();
    set({ ...NO_DRAFT });
    if (!draft) return;
    try {
      await useAppStore.getState().recordParseRejected(draft);
    } catch {
      // The event is a nicety. Failing to log it must not trap the user.
    }
  },

  discard() {
    set({ ...NO_DRAFT, text: '', sender: undefined, error: null });
  },
}));
