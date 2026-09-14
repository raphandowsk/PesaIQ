/**
 * AI reading on Supabase: the parse-sms Edge Function, which counts the
 * request against the account's daily cap and asks Claude.
 */
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { AiUnavailableError, validReadings, type AiReader } from '../../features/ai/reading';
import { getSupabase } from './client';

export function supabaseAiReader(): AiReader | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  return {
    async read(messages) {
      const { data, error } = await supabase.functions.invoke('parse-sms', {
        body: { messages },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const status = (error.context as Response).status;
          throw new AiUnavailableError(status === 429 ? 'limit' : 'unavailable');
        }
        throw new AiUnavailableError(
          error instanceof FunctionsFetchError ? 'offline' : 'unavailable',
        );
      }
      const body = (data ?? {}) as { model?: unknown; readings?: unknown };
      return {
        model: typeof body.model === 'string' ? body.model : 'claude',
        readings: validReadings(body.readings),
      };
    },
  };
}
