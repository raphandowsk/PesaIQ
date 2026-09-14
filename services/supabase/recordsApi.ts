/**
 * Sync's server side on Supabase: the `records` table (row-level security
 * keeps each account to its own rows) and the `pull_records` function.
 */
import {
  RemoteError,
  type OutgoingRecord,
  type RecordsRemote,
  type RemoteRecord,
} from '../../features/sync/remote';
import { getSupabase } from './client';

interface RecordRow {
  id: string;
  dedupe_key: string | null;
  ciphertext: string;
  nonce: string;
  key_version: number;
  deleted: boolean;
  edited_at: string;
  updated_at: string;
}

const COLUMNS = 'id, dedupe_key, ciphertext, nonce, key_version, deleted, edited_at, updated_at';

const fromRow = (r: RecordRow): RemoteRecord => ({
  id: r.id,
  dedupeKey: r.dedupe_key,
  ciphertext: r.ciphertext,
  nonce: r.nonce,
  keyVersion: r.key_version,
  deleted: r.deleted,
  editedAt: r.edited_at,
  updatedAt: r.updated_at,
});

const toRow = (r: OutgoingRecord) => ({
  id: r.id,
  dedupe_key: r.dedupeKey,
  ciphertext: r.ciphertext,
  nonce: r.nonce,
  key_version: r.keyVersion,
  deleted: r.deleted,
  edited_at: r.editedAt,
});

// 23505: a live row already has that fingerprint (records_user_dedupe_key).
const failure = (error: { code?: string; message: string }) =>
  new RemoteError(error.code === '23505' ? 'duplicate' : 'failed', error.message);

export function supabaseRecordsRemote(): RecordsRemote | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  return {
    async pull(after, limit) {
      const { data, error } = await supabase.rpc('pull_records', {
        p_after: after.updatedAt,
        p_after_id: after.id,
        p_limit: limit,
      });
      if (error) throw failure(error);
      return ((data ?? []) as RecordRow[]).map(fromRow);
    },

    async push(rows) {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('records')
        .upsert(rows.map(toRow), { onConflict: 'id' });
      if (error) throw failure(error);
    },

    async findLive(dedupeKey) {
      const { data, error } = await supabase
        .from('records')
        .select(COLUMNS)
        .eq('dedupe_key', dedupeKey)
        .eq('deleted', false)
        .maybeSingle();
      if (error) throw failure(error);
      return data ? fromRow(data as RecordRow) : null;
    },
  };
}
