import { chunkedStorage, type SecureKV } from '../features/auth/chunkedStorage';
import { AUTH_MESSAGES, authErrorMessage } from '../features/auth/errors';
import { formatTzMobile, normalizeTzMobile, phoneProblem, toE164 } from '../features/auth/phone';
import { accessFor, afterIntro, landingFor } from '../features/auth/routing';
import {
  createAuthStore,
  SIGN_IN_UNAVAILABLE,
  type AuthApi,
  type AuthResult,
  type AuthSession,
} from '../features/auth/store';
import { formatWait, resendWait } from '../features/auth/timing';

// Invented numbers only.
const NUMBER = '255700000111';

describe('mobile numbers', () => {
  it('accepts a Tanzanian mobile however it is written', () => {
    for (const typed of [
      '0700 000 111',
      '700000111',
      '+255 700 000 111',
      '255700000111',
      '+255 0700000111',
    ]) {
      expect(normalizeTzMobile(typed)).toBe(NUMBER);
    }
    expect(normalizeTzMobile('0650000111')).toBe('255650000111');
  });

  it('refuses landlines, other countries and wrong lengths', () => {
    for (const typed of ['0220000111', '254700000111', '70000011', '7000001112', '']) {
      expect(normalizeTzMobile(typed)).toBeNull();
    }
  });

  it('says what to fix', () => {
    expect(phoneProblem('')).toBe('Enter your mobile number.');
    expect(phoneProblem('70000')).toMatch(/too short/);
    expect(phoneProblem('7000001112')).toMatch(/too long/);
    expect(phoneProblem('0220000111')).toMatch(/starting with 6 or 7/);
    expect(phoneProblem('0700000111')).toBeNull();
  });

  it('writes a number the way Supabase wants it, and the way a person reads it', () => {
    expect(toE164(NUMBER)).toBe('+255700000111');
    expect(formatTzMobile(NUMBER)).toBe('+255 700 000 111');
    expect(formatTzMobile('+255700000111')).toBe('+255 700 000 111');
  });
});

describe('resend timer', () => {
  it('counts down a minute, then allows a new code', () => {
    expect(resendWait(0, 0)).toBe(60);
    expect(resendWait(0, 18_400)).toBe(42);
    expect(resendWait(0, 60_000)).toBe(0);
    expect(resendWait(0, 90_000)).toBe(0);
    expect(formatWait(42)).toBe('0:42');
    expect(formatWait(60)).toBe('1:00');
  });
});

describe('sign-in errors', () => {
  it('asks people to wait rather than repeat', () => {
    expect(authErrorMessage({ code: 'over_sms_send_rate_limit', status: 429 }, 'send')).toBe(
      AUTH_MESSAGES.waitToResend,
    );
    expect(
      authErrorMessage({ status: 429, message: 'For security purposes, you can only…' }, 'verify'),
    ).toBe(AUTH_MESSAGES.tooManyTries);
  });

  it('calls a wrong or old code what it is', () => {
    expect(authErrorMessage({ code: 'otp_expired', status: 403 }, 'verify')).toBe(
      AUTH_MESSAGES.badCode,
    );
    expect(
      authErrorMessage({ status: 403, message: 'Token has expired or is invalid' }, 'verify'),
    ).toBe(AUTH_MESSAGES.badCode);
  });

  it("never shows the service's own words when a code can't be sent", () => {
    const hook = { status: 500, message: 'Service currently unavailable due to hook' };
    expect(authErrorMessage(hook, 'send')).toBe(AUTH_MESSAGES.cantSend);
    expect(authErrorMessage({ code: 'sms_send_failed' }, 'send')).toBe(AUTH_MESSAGES.cantSend);
    expect(authErrorMessage({ code: 'hook_timeout' }, 'send')).toBe(AUTH_MESSAGES.cantSend);
    expect(Object.values(AUTH_MESSAGES).join(' ')).not.toMatch(/hook|token|rate limit/i);
  });

  it('tells a server error from a lost connection, though the client calls both "retryable"', () => {
    // What supabase-js throws when the send-sms hook fails: HTTP 500.
    const serverError = {
      name: 'AuthRetryableFetchError',
      status: 500,
      message: 'Service currently unavailable due to hook',
    };
    expect(authErrorMessage(serverError, 'send')).toBe(AUTH_MESSAGES.cantSend);
    expect(authErrorMessage(serverError, 'verify')).toBe(AUTH_MESSAGES.tryAgain);
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 }, 'send')).toBe(
      AUTH_MESSAGES.noConnection,
    );
  });

  it('spots a lost connection, a switched-off sign-in and a bad number', () => {
    expect(authErrorMessage({ name: 'AuthRetryableFetchError', message: '' }, 'send')).toBe(
      AUTH_MESSAGES.noConnection,
    );
    expect(authErrorMessage({ message: 'Network request failed' }, 'verify')).toBe(
      AUTH_MESSAGES.noConnection,
    );
    expect(authErrorMessage({ code: 'phone_provider_disabled' }, 'send')).toBe(
      AUTH_MESSAGES.switchedOff,
    );
    expect(authErrorMessage({ code: 'validation_failed', status: 400 }, 'send')).toBe(
      AUTH_MESSAGES.badNumber,
    );
    expect(authErrorMessage({ message: 'something new' }, 'signOut')).toBe(AUTH_MESSAGES.tryAgain);
  });
});

describe('session storage', () => {
  const memory = () => {
    const map = new Map<string, string>();
    const kv: SecureKV = {
      getItemAsync: async (k) => map.get(k) ?? null,
      setItemAsync: async (k, v) => {
        map.set(k, v);
      },
      deleteItemAsync: async (k) => {
        map.delete(k);
      },
    };
    return { map, kv };
  };

  it('splits a large session into chunks small enough for secure storage', async () => {
    const { map, kv } = memory();
    const store = chunkedStorage(kv, 1800);
    const session = JSON.stringify({
      access_token: 'a'.repeat(3000),
      refresh_token: 'r'.repeat(900),
    });

    await store.setItem('sb-auth', session);
    expect(await store.getItem('sb-auth')).toBe(session);
    expect(map.get('sb-auth.n')).toBe('3');
    for (const [k, v] of map) if (k !== 'sb-auth.n') expect(v.length).toBeLessThanOrEqual(1800);
  });

  it('leaves no stale chunk when a shorter session replaces a longer one', async () => {
    const { map, kv } = memory();
    const store = chunkedStorage(kv, 10);
    await store.setItem('k', 'x'.repeat(35));
    await store.setItem('k', 'short');
    expect(await store.getItem('k')).toBe('short');
    expect([...map.keys()].sort()).toEqual(['k.0', 'k.n']);
  });

  it('reads a missing or broken session as none, and removes everything', async () => {
    const { map, kv } = memory();
    const store = chunkedStorage(kv, 10);
    expect(await store.getItem('k')).toBeNull();

    await store.setItem('k', 'x'.repeat(25));
    map.delete('k.1');
    expect(await store.getItem('k')).toBeNull();

    await store.removeItem('k');
    expect(map.size).toBe(0);
  });
});

describe('where people can go', () => {
  it('needs an account for the app, and closes sign-in once signed in', () => {
    expect(accessFor(false, false)).toEqual({
      intro: true,
      signIn: true,
      onboarding: false,
      app: false,
    });
    expect(accessFor(true, false)).toEqual({
      intro: true,
      signIn: false,
      onboarding: true,
      app: false,
    });
    expect(accessFor(true, true)).toEqual({
      intro: false,
      signIn: false,
      onboarding: false,
      app: true,
    });
    expect(accessFor(false, true)).toEqual({
      intro: true,
      signIn: true,
      onboarding: false,
      app: false,
    });
  });

  it('lands a launch in the right place', () => {
    expect(landingFor(false, false)).toBe('/welcome');
    expect(landingFor(false, true)).toBe('/phone');
    expect(landingFor(true, false)).toBe('/privacy');
    expect(landingFor(true, true)).toBe('/dashboard');
    expect(afterIntro(false)).toBe('/phone');
    expect(afterIntro(true)).toBe('/privacy');
  });
});

describe('the sign-in store', () => {
  const ME: AuthSession = { userId: 'u1', phone: NUMBER };

  const fakeApi = (
    opts: { session?: AuthSession | null; send?: AuthResult; verify?: AuthResult } = {},
  ) => {
    let session = opts.session ?? null;
    let listener: ((s: AuthSession | null) => void) | null = null;
    const calls: string[] = [];
    const api: AuthApi = {
      getSession: async () => session,
      onChange: (l) => {
        listener = l;
        calls.push('subscribe');
        return () => undefined;
      },
      requestCode: async (phone) => {
        calls.push(`send ${phone}`);
        return opts.send ?? { ok: true };
      },
      verifyCode: async (phone, code) => {
        calls.push(`verify ${phone} ${code.length}`);
        const result = opts.verify ?? { ok: true };
        if (result.ok) session = ME;
        return result;
      },
      signOut: async () => {
        session = null;
        return { ok: true };
      },
    };
    return { api, calls, emit: (s: AuthSession | null) => listener?.(s) };
  };

  it('starts signed out, or signed in when a session is kept', async () => {
    const out = createAuthStore(fakeApi().api);
    await out.getState().initialize();
    expect(out.getState().status).toBe('signedOut');

    const kept = createAuthStore(fakeApi({ session: ME }).api);
    await kept.getState().initialize();
    expect(kept.getState()).toMatchObject({ status: 'signedIn', session: ME });
  });

  it('is unavailable without the Supabase settings', async () => {
    const store = createAuthStore(null);
    await store.getState().initialize();
    expect(store.getState().status).toBe('unavailable');
    expect(await store.getState().requestCode(NUMBER)).toEqual({
      ok: false,
      message: SIGN_IN_UNAVAILABLE,
    });
  });

  it('sends a code in +255 form, then signs in with it', async () => {
    const { api, calls } = fakeApi();
    const store = createAuthStore(api, () => 1000);
    await store.getState().initialize();

    expect(await store.getState().requestCode(NUMBER)).toEqual({ ok: true });
    expect(store.getState().pending).toEqual({ phone: NUMBER, sentAt: 1000 });

    expect(await store.getState().verifyCode('123456')).toEqual({ ok: true });
    expect(store.getState()).toMatchObject({ status: 'signedIn', session: ME, pending: null });
    expect(calls).toEqual(['subscribe', 'send +255700000111', 'verify +255700000111 6']);
  });

  it('keeps the number for another try when a code is refused', async () => {
    const refused = { ok: false as const, message: AUTH_MESSAGES.badCode };
    const store = createAuthStore(fakeApi({ verify: refused }).api);
    await store.getState().initialize();
    await store.getState().requestCode(NUMBER);

    expect(await store.getState().verifyCode('000000')).toEqual(refused);
    expect(store.getState()).toMatchObject({ status: 'signedOut', pending: { phone: NUMBER } });
  });

  it('asks for a number first, and remembers nothing when sending fails', async () => {
    const failing = { ok: false as const, message: AUTH_MESSAGES.cantSend };
    const store = createAuthStore(fakeApi({ send: failing }).api);
    await store.getState().initialize();
    expect(await store.getState().verifyCode('123456')).toEqual({
      ok: false,
      message: 'Ask for a code first.',
    });
    expect(await store.getState().requestCode(NUMBER)).toEqual(failing);
    expect(store.getState().pending).toBeNull();
  });

  it('follows sign-ins and sign-outs reported by the service, and subscribes once', async () => {
    const { api, calls, emit } = fakeApi();
    const store = createAuthStore(api);
    await store.getState().initialize();
    await store.getState().initialize();
    expect(calls.filter((c) => c === 'subscribe')).toHaveLength(1);

    emit(ME);
    expect(store.getState().status).toBe('signedIn');
    emit(null);
    expect(store.getState()).toMatchObject({ status: 'signedOut', session: null });
  });

  it('signs out on this phone', async () => {
    const store = createAuthStore(fakeApi({ session: ME }).api);
    await store.getState().initialize();
    expect(await store.getState().signOut()).toEqual({ ok: true });
    expect(store.getState()).toMatchObject({ status: 'signedOut', session: null });
  });

  it('turns a service that throws into a plain failure', async () => {
    const { api } = fakeApi();
    const store = createAuthStore({
      ...api,
      requestCode: async () => {
        throw new Error('boom');
      },
    });
    expect(await store.getState().requestCode(NUMBER)).toEqual({
      ok: false,
      message: AUTH_MESSAGES.tryAgain,
    });
  });
});
