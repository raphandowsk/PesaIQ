/**
 * The bulk import (decided 2026-09-14): up to 90 days of past messages,
 * pasted at once, once per account. After it, messages are added one at a
 * time in the Lab.
 *
 * Paste → read on the phone → preview (what is saved, kept for review or left
 * out, and why) → import. The account's one import is claimed on the server
 * only when the person confirms, so reading and backing out costs nothing.
 * Message text is held here only until the import finishes or is reset.
 */
import { create } from 'zustand';

import { useAppStore, type ImportSaveOutcome } from '../transactions/store';
import { formatAmount } from '../../utils/format';
import { importCutoff, planOne, SELECTABLE, type ImportItem } from './plan';
import { MAX_IMPORT_CHARS, MAX_IMPORT_MESSAGES, splitMessages } from './split';

/** The server side (`bulk_imports`, `claim_bulk_import`). Methods throw on failure. */
export interface BulkImportApi {
  /** When this account's import was used, or null while it is still available. */
  usedAt(): Promise<string | null>;
  /** Claims it: `claimed` is false when it was already used, with when. */
  claim(): Promise<{ claimed: boolean; usedAt: string }>;
}

/**
 * Which conversation the paste came from. A thread copied from one sender is
 * that sender's, which helps tell operators apart (their sender IDs, spec §27).
 */
export const IMPORT_SENDERS = [
  { key: 'mixed', label: 'Mixed or not sure', sender: undefined },
  { key: 'mpesa', label: 'M-Pesa', sender: 'M-PESA' },
  { key: 'airtel', label: 'Airtel Money', sender: 'AIRTEL MONEY' },
  { key: 'mixx', label: 'Mixx by Yas', sender: 'MIXX' },
  { key: 'halopesa', label: 'HaloPesa', sender: 'HALOPESA' },
  { key: 'tpesa', label: 'T-PESA', sender: 'T-PESA' },
] as const;
export type ImportSenderKey = (typeof IMPORT_SENDERS)[number]['key'];

export const IMPORT_ERRORS = {
  empty: 'Paste your messages first.',
  tooBig: `That is more than ${formatAmount(MAX_IMPORT_CHARS)} characters, more than 90 days of messages. Leave out the oldest and try again.`,
  tooMany: `That is more than ${formatAmount(MAX_IMPORT_MESSAGES)} messages. Leave out the oldest and try again.`,
  nothingChosen: 'Choose at least one message to import.',
  offline:
    "Couldn't reach PesaIQ to start the import. Check your connection and try again. Nothing was imported.",
  alreadyUsed: "This account's import was already used, so nothing was imported.",
  unavailable: 'Importing needs the PesaIQ server, which this copy of the app was built without.',
  saveFailed:
    'The import stopped before it finished. The records saved so far are kept; add the rest in the Lab.',
} as const;

export type ImportPhase =
  'checking' | 'unavailable' | 'used' | 'ready' | 'reading' | 'preview' | 'importing' | 'done';

export interface ImportState {
  phase: ImportPhase;
  /** When this account's import was used, once known. */
  usedAt: string | null;
  text: string;
  senderKey: ImportSenderKey;
  items: ImportItem[];
  /** Ids the person left out of the import. */
  leftOut: string[];
  progress: { done: number; total: number };
  outcome: ImportSaveOutcome | null;
  error: string | null;

  /** Whether the account's import is still available. Leaves work in progress alone. */
  check(): Promise<void>;
  setText(text: string): void;
  setSender(key: ImportSenderKey): void;
  /** Split and read the paste, then show the preview. */
  read(): Promise<void>;
  toggle(id: string): void;
  /** Back from the preview to the paste. */
  edit(): void;
  /** Claim the account's import and save what was chosen. */
  run(): Promise<void>;
  /** Forget the paste and start again. */
  reset(): void;
}

/** Parse this many messages, then let the screen draw. */
const CHUNK = 25;
/** Report saving progress this often. */
const PROGRESS_EVERY = 10;

const defaultPause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export const chosenItems = (items: readonly ImportItem[], leftOut: readonly string[]) =>
  items.filter((i) => SELECTABLE.includes(i.status) && !leftOut.includes(i.id));

const CLEARED = { text: '', items: [], leftOut: [] as string[] };

export function createImportStore(
  api: BulkImportApi | null,
  deps: { now?: () => Date; pause?: () => Promise<void> } = {},
) {
  const now = deps.now ?? (() => new Date());
  const pause = deps.pause ?? defaultPause;

  return create<ImportState>()((set, get) => ({
    phase: 'checking',
    usedAt: null,
    text: '',
    senderKey: 'mixed',
    items: [],
    leftOut: [],
    progress: { done: 0, total: 0 },
    outcome: null,
    error: null,

    async check() {
      const { phase } = get();
      if (phase === 'reading' || phase === 'preview' || phase === 'importing') return;
      if (!api) {
        set({ phase: 'unavailable' });
        return;
      }
      if (phase !== 'done') set({ phase: 'checking' });
      try {
        const usedAt = await api.usedAt();
        if (usedAt) set({ phase: phase === 'done' ? 'done' : 'used', usedAt });
        else set({ phase: 'ready', usedAt: null, outcome: null });
      } catch {
        // Offline: the paste can still be read. Claiming it decides.
        if (phase !== 'done') set({ phase: 'ready' });
      }
    },

    setText(text) {
      set({ text, error: null });
    },

    setSender(senderKey) {
      set({ senderKey });
    },

    async read() {
      const { text, senderKey } = get();
      if (!text.trim()) {
        set({ error: IMPORT_ERRORS.empty });
        return;
      }
      if (text.length > MAX_IMPORT_CHARS) {
        set({ error: IMPORT_ERRORS.tooBig });
        return;
      }
      const pieces = splitMessages(text);
      if (pieces.length > MAX_IMPORT_MESSAGES) {
        set({ error: IMPORT_ERRORS.tooMany });
        return;
      }

      const sender = IMPORT_SENDERS.find((s) => s.key === senderKey)?.sender;
      const readOne = (t: string) => useAppStore.getState().analyze(t, sender);
      const cutoff = importCutoff(now());
      const seen = new Set<string>();
      const items: ImportItem[] = [];

      set({ phase: 'reading', error: null, progress: { done: 0, total: pieces.length } });
      for (const [i, piece] of pieces.entries()) {
        items.push(planOne(piece, i, readOne, cutoff, seen));
        if ((i + 1) % CHUNK === 0) {
          set({ progress: { done: i + 1, total: pieces.length } });
          await pause();
        }
      }
      set({ phase: 'preview', items, leftOut: [], progress: { done: 0, total: 0 } });
    },

    toggle(id) {
      const { leftOut } = get();
      set({
        leftOut: leftOut.includes(id) ? leftOut.filter((x) => x !== id) : [...leftOut, id],
        error: null,
      });
    },

    edit() {
      set({ phase: 'ready', items: [], leftOut: [], error: null });
    },

    async run() {
      const chosen = chosenItems(get().items, get().leftOut);
      if (chosen.length === 0) {
        set({ error: IMPORT_ERRORS.nothingChosen });
        return;
      }
      if (!api) {
        set({ error: IMPORT_ERRORS.unavailable });
        return;
      }

      const total = chosen.length;
      set({ phase: 'importing', error: null, progress: { done: 0, total } });

      let claim: { claimed: boolean; usedAt: string };
      try {
        claim = await api.claim();
      } catch {
        set({ phase: 'preview', error: IMPORT_ERRORS.offline });
        return;
      }
      if (!claim.claimed) {
        set({ ...CLEARED, phase: 'used', usedAt: claim.usedAt, error: IMPORT_ERRORS.alreadyUsed });
        return;
      }

      try {
        const outcome = await useAppStore.getState().saveImported(
          chosen.map((i) => i.result!),
          (done) => {
            if (done % PROGRESS_EVERY === 0 || done === total) set({ progress: { done, total } });
          },
        );
        set({ ...CLEARED, phase: 'done', usedAt: claim.usedAt, outcome });
      } catch {
        set({
          ...CLEARED,
          phase: 'done',
          usedAt: claim.usedAt,
          outcome: null,
          error: IMPORT_ERRORS.saveFailed,
        });
      }
    },

    reset() {
      set({ ...CLEARED, phase: 'checking', outcome: null, error: null });
    },
  }));
}
