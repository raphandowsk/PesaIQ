// Supabase Auth "Send SMS" hook: sends sign-up and sign-in codes through
// messaging-service.co.tz.
//
// Deployed with JWT checks off: Supabase signs every call with the hook secret
// (Standard Webhooks), and the signature is verified here before anything else.
//
// Secrets, set by the project owner in the Supabase dashboard (never in code):
//   SEND_SMS_HOOK_SECRET     "v1,whsec_..." from Authentication > Hooks
//   MESSAGING_SERVICE_TOKEN  the provider's API token
//   MESSAGING_SERVICE_MODE   "live" to send real SMS; anything else uses the
//                            provider's free test endpoint
//
// Never logs the code or a whole phone number.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

import {
  codeMessage,
  LIVE_URL,
  maskNumber,
  modeFrom,
  outcomeOf,
  providerHttpError,
  SENDER_ID,
  tanzanianMobile,
  TEST_URL,
  type HookError,
} from './logic.ts';

/** Auth hooks have a few seconds in all; leave room to answer. */
const PROVIDER_TIMEOUT_MS = 4000;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fail = (error: HookError) => reply(error.http_code, { error });

const UNAVAILABLE: HookError = {
  http_code: 503,
  message: "Codes can't be sent right now. Please try again later.",
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail({ http_code: 405, message: 'Method not allowed' });

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET');
  const token = Deno.env.get('MESSAGING_SERVICE_TOKEN');
  if (!hookSecret || !token) {
    console.error('send-sms: SEND_SMS_HOOK_SECRET or MESSAGING_SERVICE_TOKEN is not set');
    return fail(UNAVAILABLE);
  }

  const payload = await req.text();
  let phone: string | undefined;
  let otp: string | undefined;
  try {
    const hook = new Webhook(hookSecret.replace('v1,whsec_', ''));
    const verified = hook.verify(payload, Object.fromEntries(req.headers)) as {
      user?: { phone?: string };
      sms?: { otp?: string };
    };
    phone = verified.user?.phone;
    otp = verified.sms?.otp;
  } catch {
    return fail({ http_code: 401, message: 'Invalid signature' });
  }

  const to = tanzanianMobile(phone);
  if (!to) {
    return fail({
      http_code: 400,
      message: 'PesaIQ sends codes to Tanzanian mobile numbers (+255) only.',
    });
  }
  if (!otp || !/^\d{4,10}$/.test(otp)) {
    console.error('send-sms: the hook payload carried no usable code');
    return fail(UNAVAILABLE);
  }

  const mode = modeFrom(Deno.env.get('MESSAGING_SERVICE_MODE'));
  const hookId = req.headers.get('webhook-id') ?? crypto.randomUUID();
  const reference = `pesaiq-${hookId.replace(/[^A-Za-z0-9]/g, '').slice(-16)}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(mode === 'live' ? LIVE_URL : TEST_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ from: SENDER_ID, to, text: codeMessage(otp), flash: 0, reference }),
      signal: controller.signal,
    });
  } catch (e) {
    const why = e instanceof Error ? e.name : 'error';
    console.error(`send-sms: provider unreachable (${mode}) for ${maskNumber(to)}: ${why}`);
    return fail({ http_code: 502, message: 'The code could not be sent. Please try again.' });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    console.error(`send-sms: provider HTTP ${res.status} (${mode}) for ${maskNumber(to)}`);
    return fail(providerHttpError(res.status));
  }

  const outcome = outcomeOf(await res.json().catch(() => null));
  if (!outcome.ok) {
    console.error(`send-sms: not sent (${mode}) to ${maskNumber(to)}: ${outcome.status}`);
    return fail(outcome.error);
  }
  console.log(`send-sms: sent (${mode}) to ${maskNumber(to)}: ${outcome.status} [${reference}]`);
  return reply(200, {});
});
