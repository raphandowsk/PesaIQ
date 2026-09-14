/**
 * Signing in with Supabase: a code by SMS to a mobile number.
 *
 * The code itself is sent by the send-sms hook (supabase/functions/send-sms).
 * Every failure is turned into a plain sentence here (features/auth/errors).
 */
import type { Session } from '@supabase/supabase-js';

import { asAuthError, authErrorMessage, type AuthStep } from '../../features/auth/errors';
import type { AuthApi, AuthResult, AuthSession } from '../../features/auth/store';
import { getSupabase } from './client';

const toSession = (session: Session | null): AuthSession | null =>
  session ? { userId: session.user.id, phone: session.user.phone ?? null } : null;

const failed = (error: unknown, step: AuthStep): AuthResult => ({
  ok: false,
  message: authErrorMessage(asAuthError(error), step),
});

export function supabaseAuthApi(): AuthApi | null {
  const supabase = getSupabase();
  if (!supabase) return null;

  return {
    async getSession() {
      const { data } = await supabase.auth.getSession();
      return toSession(data.session);
    },

    onChange(listener) {
      const { data } = supabase.auth.onAuthStateChange((_event, session) =>
        listener(toSession(session)),
      );
      return () => data.subscription.unsubscribe();
    },

    async requestCode(phone) {
      try {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        return error ? failed(error, 'send') : { ok: true };
      } catch (e) {
        return failed(e, 'send');
      }
    },

    async verifyCode(phone, code) {
      try {
        const { error } = await supabase.auth.verifyOtp({ phone, token: code, type: 'sms' });
        return error ? failed(error, 'verify') : { ok: true };
      } catch (e) {
        return failed(e, 'verify');
      }
    },

    async signOut() {
      try {
        // 'local': this phone only. The default would sign out every phone.
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        return error ? failed(error, 'signOut') : { ok: true };
      } catch (e) {
        return failed(e, 'signOut');
      }
    },
  };
}
