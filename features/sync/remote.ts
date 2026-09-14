/**
 * The server side of sync, as the engine sees it: locked rows only. Supabase
 * in the app (services/supabase/recordsApi.ts), an in-memory fake in tests.
 */

export interface RemoteRecord {
  /** Made on the phone that first sent the record; the same on every phone. */
  id: string;
  /** Keyed fingerprint of the transaction ID, or null when it has none. */
  dedupeKey: string | null;
  ciphertext: string;
  nonce: string;
  keyVersion: number;
  /** A deletion, kept so it reaches the other phones. Its ciphertext is empty. */
  deleted: boolean;
  /** When the change was made, on the phone that made it. */
  editedAt: string;
  /** When the server accepted it, exactly as the server wrote it: the pull position. */
  updatedAt: string;
}

export type OutgoingRecord = Omit<RemoteRecord, 'updatedAt'>;

/** Where a pull continues from: after this row, in (updatedAt, id) order. */
export interface PullCursor {
  updatedAt: string;
  id: string;
}

export const START: PullCursor = {
  updatedAt: '1970-01-01T00:00:00.000Z',
  id: '00000000-0000-0000-0000-000000000000',
};

/** The account's locked preferences document (`synced_settings`). */
export interface RemotePreferences {
  ciphertext: string;
  nonce: string;
  keyVersion: number;
  editedAt: string;
}

export interface OutgoingPreferences extends RemotePreferences {
  userId: string;
}

export interface RecordsRemote {
  /** Rows changed after `after`, oldest first, at most `limit`. */
  pull(after: PullCursor, limit: number): Promise<RemoteRecord[]>;
  /**
   * Adds or updates rows by id, all or none. An older edit leaves a row as it
   * is. Throws `RemoteError` 'duplicate' when a live row already has one of
   * the fingerprints.
   */
  push(rows: OutgoingRecord[]): Promise<void>;
  /** The live row with this fingerprint, if any. */
  findLive(dedupeKey: string): Promise<RemoteRecord | null>;
  /** The account's preferences document, if it has one. */
  fetchPreferences(): Promise<RemotePreferences | null>;
  /** Replaces the document, unless the server's is a later edit. */
  pushPreferences(doc: OutgoingPreferences): Promise<void>;
}

export type RemoteFailure = 'duplicate' | 'failed';

export class RemoteError extends Error {
  readonly kind: RemoteFailure;
  constructor(kind: RemoteFailure, message: string) {
    super(message);
    this.name = 'RemoteError';
    this.kind = kind;
  }
}

/** By name rather than `instanceof`, which a transpiled Error subclass can lose. */
export const isDuplicateRejection = (e: unknown): boolean =>
  e instanceof Error && e.name === 'RemoteError' && (e as RemoteError).kind === 'duplicate';
