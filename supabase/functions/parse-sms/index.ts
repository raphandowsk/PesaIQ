// AI message reading: reads SMS text with Claude and answers with what each
// message states (amount, fee, taxes, reference, and so on).
//
// Signed-in callers only: deployed with JWT checks on. Each request is counted
// against the account's daily cap (ai_take, called with the caller's own
// sign-in) before any message is sent to Anthropic.
//
// Secret, set by the project owner (never in code): ANTHROPIC_API_KEY.
//
// Never logs message text or what Claude read from it: only counts and statuses.
import {
  ANTHROPIC_URL,
  ANTHROPIC_VERSION,
  buildRequest,
  checkInput,
  MODEL,
  readResults,
} from './logic.ts';

const CLAUDE_TIMEOUT_MS = 45_000;
const UNAVAILABLE = 'AI reading is not available right now';

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

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  const key = apiKey();
  if (!anthropicKey || !url || !key) {
    console.error('parse-sms: ANTHROPIC_API_KEY is not set');
    return reply(503, { error: UNAVAILABLE });
  }

  let input: ReturnType<typeof checkInput>;
  try {
    input = checkInput(await req.json());
  } catch {
    return reply(400, { error: 'Bad request' });
  }
  if (!input.ok) return reply(400, { error: input.error });

  // Count first. Messages the server cannot count are not sent.
  const counted = await fetch(`${url}/rest/v1/rpc/ai_take`, {
    method: 'POST',
    headers: { apikey: key, Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_count: input.messages.length }),
  });
  if (!counted.ok) {
    console.error(`parse-sms: ai_take answered HTTP ${counted.status}`);
    return reply(counted.status === 401 ? 401 : 503, { error: UNAVAILABLE });
  }
  const take = (await counted.json()) as { allowed: boolean; limit?: number };
  if (!take.allowed)
    return reply(429, { error: 'Daily AI reading limit reached', limit: take.limit });

  let answer: Response;
  try {
    answer = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildRequest(input.messages)),
      signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
    });
  } catch (e) {
    console.error(`parse-sms: no answer from Anthropic (${e instanceof Error ? e.name : 'error'})`);
    return reply(502, { error: UNAVAILABLE });
  }
  if (!answer.ok) {
    // The body can echo the request, so only the status is logged.
    console.error(`parse-sms: Anthropic answered HTTP ${answer.status}`);
    return reply(502, { error: UNAVAILABLE });
  }

  const readings = readResults(
    await answer.json(),
    input.messages.map((m) => m.id),
  );
  console.log(`parse-sms: read ${readings.length} of ${input.messages.length}`);
  return reply(200, { model: MODEL, readings });
});
