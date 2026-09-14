// The PIN's guess limit, as an oblivious pseudorandom function (OPRF).
//
// The phone sends its PIN blinded: a point on the ristretto255 curve that
// reveals nothing about the PIN. This function counts the guess (pin_attempt,
// called with the user's own sign-in), and only if a guess is allowed does it
// multiply the point by a secret key made for this user from PIN_OPRF_SECRET.
// The phone unblinds the answer and derives the key that locks its account
// key. Without PIN_OPRF_SECRET, a copy of the database cannot test PINs.
//
// Secret, set by the project owner (never in code): PIN_OPRF_SECRET, 32+
// random characters. Changing it makes every existing PIN stop working.
//
// Never logs a PIN, a point or a key.
import { ristretto255 } from 'npm:@noble/curves@1.9.7/ed25519';
import { mod } from 'npm:@noble/curves@1.9.7/abstract/modular';
import { bytesToNumberLE } from 'npm:@noble/curves@1.9.7/utils';
import { hkdf } from 'npm:@noble/hashes@1.8.0/hkdf';
import { sha512 } from 'npm:@noble/hashes@1.8.0/sha2';
import { utf8ToBytes } from 'npm:@noble/hashes@1.8.0/utils';

const Point = ristretto255.Point;
const ORDER = Point.Fn.ORDER;
const KEY_SALT = utf8ToBytes('PesaIQ-PIN-OPRF-key-v1');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** This user's OPRF key: never stored, re-derived from the secret each time. */
function userScalar(secret: string, userId: string): bigint {
  const k = mod(
    bytesToNumberLE(hkdf(sha512, utf8ToBytes(secret), KEY_SALT, utf8ToBytes(userId), 64)),
    ORDER,
  );
  if (k === BigInt(0)) throw new Error('degenerate key');
  return k;
}

/** The publishable (anon) key, to call the database as the signed-in user. */
function apiKey(): string | undefined {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}') as Record<
      string,
      string
    >;
    return Object.values(keys)[0];
  } catch {
    return undefined;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'Method not allowed' });

  const auth = req.headers.get('Authorization');
  if (!auth) return reply(401, { error: 'Sign in first' });

  const secret = Deno.env.get('PIN_OPRF_SECRET');
  const url = Deno.env.get('SUPABASE_URL');
  const key = apiKey();
  if (!secret || secret.length < 32 || !url || !key) {
    console.error('pin-oprf: PIN_OPRF_SECRET is missing or shorter than 32 characters');
    return reply(503, { error: 'PIN is not available right now' });
  }

  let blinded: InstanceType<typeof Point>;
  try {
    const body = (await req.json()) as { blinded?: string };
    blinded = Point.fromBytes(fromBase64(body.blinded ?? ''));
    if (blinded.is0()) throw new Error('identity');
  } catch {
    return reply(400, { error: 'Bad request' });
  }

  // Count the guess first. A guess the server cannot count is not answered.
  const counted = await fetch(`${url}/rest/v1/rpc/pin_attempt`, {
    method: 'POST',
    headers: { apikey: key, Authorization: auth, 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!counted.ok) {
    console.error(`pin-oprf: pin_attempt answered HTTP ${counted.status}`);
    return reply(counted.status === 401 ? 401 : 503, { error: 'PIN is not available right now' });
  }
  const attempt = (await counted.json()) as {
    allowed: boolean;
    retry_at?: string;
    failures?: number;
    user_id?: string;
  };
  if (!attempt.allowed) {
    return reply(429, { retry_at: attempt.retry_at, failures: attempt.failures ?? 0 });
  }
  if (!attempt.user_id) return reply(503, { error: 'PIN is not available right now' });

  const evaluated = blinded.multiply(userScalar(secret, attempt.user_id)).toBytes();
  return reply(200, { evaluated: toBase64(evaluated), failures: attempt.failures ?? 0 });
});
