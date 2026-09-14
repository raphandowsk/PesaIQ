/**
 * The account's one bulk import on Supabase: `bulk_imports` (read-only to the
 * account) and `claim_bulk_import()`, the only way to use it.
 */
import type { BulkImportApi } from '../../features/import/store';
import { getSupabase } from './client';

interface ClaimRow {
  claimed: boolean;
  used_at: string;
}

export function supabaseImportApi(): BulkImportApi | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  return {
    async usedAt() {
      const { data, error } = await supabase.from('bulk_imports').select('used_at').maybeSingle();
      if (error) throw error;
      return (data as { used_at: string } | null)?.used_at ?? null;
    },

    async claim() {
      const { data, error } = await supabase.rpc('claim_bulk_import');
      if (error) throw error;
      const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | undefined;
      if (!row) throw new Error('No answer from claim_bulk_import');
      return { claimed: row.claimed, usedAt: row.used_at };
    },
  };
}
