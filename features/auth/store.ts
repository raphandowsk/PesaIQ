/**
 * Who is signed in, and the steps of signing in.
 *
 * The store talks to the sign-in service through `AuthApi`: Supabase in the
 * app (services/supabase/authApi.ts), a fake in tests. It never sees a code
 * after checking it, and never logs a number.
 */
import { create } from 'zustand';

import { AUTH_MESSAGES } from './errors';
import { toE164 } from './phone';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'unavailable';

export interface AuthSession {
  userId: string;
  /** As Supabase keeps it: 255 then nine digits. */
  phone: string | null;
}

export type AuthResult = { ok: true } | { ok: false; message: string };

/** What the app needs from the sign-in service. Methods report failure; they do not throw. */
export interface AuthApi {
  getSession(): Promise<AuthSession | null>;
  /** Called on every sign-in, sign-out and refresh. Returns an unsubscribe. */
  onChange(listener: (session: AuthSession | null) => void): () => void;
  requestCode(phoneE164: string): Promise<AuthResult>;
  verifyCode(phoneE164: string, code: string): Promise<AuthResult>;
  /** Signs out on this phone only. */
  signOut(): Promise<AuthResult>;
  /**
   * Ends the account's sign-ins on every other phone; this one stays signed
   * in. Each drops out when its sign-in next renews (within the hour).
   */
  signOutOthers(): Promise<AuthResult>;
  /** Deletes the signed-in account, and everything the server holds for it. */
  deleteAccount(): Promise<AuthResult>;
}

export interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  /** The number a code was last sent to (255 form), and when. */
  pending: { phone: string; sentAt: number } | null;
  initialize(): Promise<void>;
  /** `phone` in the 255 form. */
  requestCode(phone: string): Promise<AuthResult>;
  verifyCode(code: string): Promise<AuthResult>;
  signOut(): Promise<AuthResult>;
  /** For a lost or replaced phone: signs out every other phone, not this one. */
  signOutOthers(): Promise<AuthResult>;
  /**
   * Deletes the account on the server. Only once the server has done so does
   * `afterDeleted` run (clearing this phone); then this phone signs out. If the
   * server refuses, nothing changes here.
   */
  deleteAccount(afterDeleted?: () => Promise<void>): Promise<AuthResult>;
}

export const SIGN_IN_UNAVAILABLE = "Sign-in isn't set up in this copy of PesaIQ.";

export function createAuthStore(api: AuthApi | null, now: () => number = Date.now) {
  let unsubscribe: (() => void) | null = null;

  // A call that throws anyway reads as a plain failure, never a crash.
  const guarded = async (call: () => Promise<AuthResult>): Promise<AuthResult> => {
    try {
      return await call();
    } catch {
      return { ok: false, message: AUTH_MESSAGES.tryAgain };
    }
  };

  const currentSession = async (): Promise<AuthSession | null> => {
    try {
      return api ? await api.getSession() : null;
    } catch {
      return null;
    }
  };

  return create<AuthState>()((set, get) => ({
    status: 'loading',
    session: null,
    pending: null,

    async initialize() {
      if (!api) {
        set({ status: 'unavailable' });
        return;
      }
      if (unsubscribe) return;
      unsubscribe = api.onChange((session) =>
        set({ session, status: session ? 'signedIn' : 'signedOut' }),
      );
      const session = await currentSession();
      set({ session, status: session ? 'signedIn' : 'signedOut' });
    },

    async requestCode(phone) {
      if (!api) return { ok: false, message: SIGN_IN_UNAVAILABLE };
      const result = await guarded(() => api.requestCode(toE164(phone)));
      if (result.ok) set({ pending: { phone, sentAt: now() } });
      return result;
    },

    async verifyCode(code) {
      if (!api) return { ok: false, message: SIGN_IN_UNAVAILABLE };
      const pending = get().pending;
      if (!pending) return { ok: false, message: 'Ask for a code first.' };
      const result = await guarded(() => api.verifyCode(toE164(pending.phone), code));
      if (!result.ok) return result;
      const session = await currentSession();
      set(session ? { pending: null, session, status: 'signedIn' } : { pending: null });
      return result;
    },

    async signOut() {
      if (!api) return { ok: false, message: SIGN_IN_UNAVAILABLE };
      const result = await guarded(() => api.signOut());
      if (result.ok) set({ session: null, status: 'signedOut', pending: null });
      return result;
    },

    async signOutOthers() {
      if (!api) return { ok: false, message: SIGN_IN_UNAVAILABLE };
      return guarded(() => api.signOutOthers());
    },

    async deleteAccount(afterDeleted) {
      if (!api) return { ok: false, message: SIGN_IN_UNAVAILABLE };
      const result = await guarded(() => api.deleteAccount());
      if (!result.ok) return result;
      try {
        await afterDeleted?.();
      } catch {
        // The caller reports what it could not clear. The account is gone
        // either way, so this phone still signs out.
      }
      // Its session goes too, even if the service can no longer confirm it.
      await guarded(() => api.signOut());
      set({ session: null, status: 'signedOut', pending: null });
      return result;
    },
  }));
}
