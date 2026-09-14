/**
 * The PIN's server side on Supabase: the locked account key (account_keys),
 * the guess-limited evaluation (the pin-oprf Edge Function) and the guess
 * count (pin_confirm, pin_reset).
 */
import { FunctionsHttpError } from '@supabase/supabase-js';

import { fromBase64, toBase64 } from '../../features/pin/bytes';
import { PIN_MESSAGES, type PinApi } from '../../features/pin/store';
import { getSupabase } from './client';

const UNAVAILABLE = "Your PIN can't be checked right now. Please try again later.";

export function supabasePinApi(): PinApi | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  return {
    async fetchKey() {
      const { data, error } = await supabase
        .from('account_keys')
        .select('wrapped_key, wrap_nonce, kdf_salt')
        .maybeSingle();
      if (error) throw error;
      return data
        ? { wrappedKey: data.wrapped_key, nonce: data.wrap_nonce, salt: data.kdf_salt }
        : null;
    },

    async saveKey(record) {
      const { error } = await supabase.from('account_keys').insert({
        wrapped_key: record.wrappedKey,
        wrap_nonce: record.nonce,
        kdf: 'oprf-ristretto255-v1',
        kdf_salt: record.salt,
        kdf_params: { pin_digits: 4, oprf: 'ristretto255-sha512', wrap: 'hkdf-sha256 aes-256-gcm' },
      });
      if (error) throw error;
    },

    async evaluate(blinded) {
      const { data, error } = await supabase.functions.invoke('pin-oprf', {
        body: { blinded: toBase64(blinded) },
      });
      if (error) {
        if (error instanceof FunctionsHttpError) {
          const response = error.context as Response;
          if (response.status === 429) {
            const body = (await response.json().catch(() => ({}))) as {
              retry_at?: string;
              failures?: number;
            };
            if (body.retry_at) {
              return { kind: 'locked', retryAt: body.retry_at, failures: body.failures ?? 0 };
            }
          }
          return { kind: 'failed', message: UNAVAILABLE };
        }
        return { kind: 'failed', message: PIN_MESSAGES.offline };
      }
      const body = data as { evaluated?: string; failures?: number } | null;
      if (!body?.evaluated) return { kind: 'failed', message: UNAVAILABLE };
      return {
        kind: 'evaluated',
        evaluated: fromBase64(body.evaluated),
        failures: body.failures ?? 0,
      };
    },

    async confirm(verifier) {
      const { data, error } = await supabase.rpc('pin_confirm', { p_verifier: toBase64(verifier) });
      if (error) throw error;
      return data === true;
    },

    async startOver() {
      const { error } = await supabase.rpc('pin_reset');
      if (error) throw error;
    },

    async isKeyCurrent(verifier) {
      const { data, error } = await supabase.rpc('pin_key_is_current', {
        p_verifier: toBase64(verifier),
      });
      if (error) throw error;
      return data === true;
    },
  };
}
