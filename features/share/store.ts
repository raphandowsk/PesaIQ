/**
 * A message shared to PesaIQ from another app, waiting to be read.
 *
 * Held in memory only: from the moment Android hands it over until the app is
 * signed in and unlocked, when it opens in the Lab (`openSharedMessage`). It
 * is never stored or logged here; it is saved, like a pasted message, only if
 * the person saves the result.
 */
import { create } from 'zustand';

/** The shared text as a message: trimmed, and null when there is nothing in it. */
export function sharedMessageText(raw: string | null | undefined): string | null {
  const text = (raw ?? '').replace(/\r\n?/g, '\n').trim();
  return text || null;
}

export interface ShareState {
  /** The latest shared message not yet opened. A newer share replaces it. */
  pending: string | null;
  receive(raw: string | null | undefined): void;
  /** Hands the pending message over, once. */
  take(): string | null;
}

export const useShareStore = create<ShareState>()((set, get) => ({
  pending: null,

  receive(raw) {
    const text = sharedMessageText(raw);
    if (text) set({ pending: text });
  },

  take() {
    const { pending } = get();
    if (pending) set({ pending: null });
    return pending;
  },
}));
