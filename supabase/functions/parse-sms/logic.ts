/**
 * The parse-sms function's rules: what it accepts, what it asks Claude, and
 * how it checks Claude's answer. No Deno APIs here, so the app's Jest suite
 * can test it.
 *
 * Messages arrive with phone, account and card numbers already masked by the
 * phone (features/ai/mask.ts).
 */

export const MODEL = 'claude-haiku-4-5-20251001';
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';

/** Per request: a bulk import is sent in batches of this many. */
export const MAX_MESSAGES = 20;
/** The app refuses longer messages (MAX_MESSAGE_LENGTH). */
export const MAX_MESSAGE_CHARS = 1600;

// The app's vocabulary (types/domain.ts), repeated because a function can't
// import app code. tests/parse-sms.test.ts checks that the two match.
export const MESSAGE_CATEGORIES = [
  'PAYMENT_RECEIVED',
  'PAYMENT_SENT',
  'WITHDRAWAL',
  'DEPOSIT',
  'BANK_TRANSFER',
  'AIRTIME_PURCHASE',
  'BILL_PAYMENT',
  'BALANCE_UPDATE',
  'OTP',
  'PROMOTIONAL',
  'SECURITY_ALERT',
  'OTHER',
] as const;

export const MONEY_CATEGORIES = [
  'FOOD_SHOPPING',
  'FUEL_TRANSPORT',
  'ELECTRICITY_WATER',
  'AIRTIME_DATA',
  'BETTING',
  'SENT_TO_PEOPLE',
  'BILLS_SERVICES',
  'CASH_WITHDRAWAL',
  'OTHER_SPENDING',
  'SALARY',
  'BUSINESS',
  'RECEIVED_FROM_PEOPLE',
  'OTHER_INCOME',
] as const;

export const TAX_CODES = ['VAT', 'EXCISE', 'LEVY', 'EWURA', 'REA', 'OTHER'] as const;
export const TAX_PLACES = ['fee', 'amount', 'extra'] as const;

/** The app's field keys (the Result screen's rows), for "unsure". */
export const FIELD_KEYS = [
  'category',
  'provider',
  'amount',
  'fee',
  'taxes',
  'counterparty',
  'masked',
  'reference',
  'balance',
  'date',
  'moneyCategory',
] as const;

type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
type MoneyCategory = (typeof MONEY_CATEGORIES)[number];
type TaxCode = (typeof TAX_CODES)[number];
type TaxPlace = (typeof TAX_PLACES)[number];
type FieldKey = (typeof FIELD_KEYS)[number];

export interface IncomingMessage {
  id: string;
  text: string;
  sender: string | null;
}

export type InputCheck = { ok: true; messages: IncomingMessage[] } | { ok: false; error: string };

export function checkInput(body: unknown): InputCheck {
  const list = (body as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'No messages' };
  if (list.length > MAX_MESSAGES) {
    return { ok: false, error: `At most ${MAX_MESSAGES} messages at a time` };
  }

  const messages: IncomingMessage[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const m = (item ?? {}) as { id?: unknown; text?: unknown; sender?: unknown };
    const id = typeof m.id === 'string' ? m.id : '';
    const text = typeof m.text === 'string' ? m.text.trim() : '';
    if (!id || id.length > 64 || seen.has(id)) return { ok: false, error: 'Bad message id' };
    if (!text || text.length > MAX_MESSAGE_CHARS) return { ok: false, error: 'Bad message text' };
    seen.add(id);
    const sender = typeof m.sender === 'string' && m.sender.length <= 40 ? m.sender : null;
    messages.push({ id, text, sender });
  }
  return { ok: true, messages };
}

export const SYSTEM_PROMPT = `You read SMS messages from Tanzanian mobile money services and banks (for example M-Pesa, Mixx by Yas, Airtel Money, HaloPesa, T-Pesa, CRDB, NMB and NBC), written in English or Swahili, and record what each one says about money. Call record_messages once, with one result per message, using each message's id.

Rules:
- Record only what the message states. Never guess, and never work out a value the message doesn't write: use null.
- Amounts are plain numbers without separators: "TSh 1,500.00" is 1500. The currency is almost always TZS.
- category is what the message is: PAYMENT_RECEIVED (money in from a person or business), PAYMENT_SENT (money sent to a person, or paid to a merchant or Lipa number), WITHDRAWAL (cash out at an agent or ATM), DEPOSIT (cash in), BANK_TRANSFER (between a bank and a wallet, or between banks), AIRTIME_PURCHASE (airtime or data bundles), BILL_PAYMENT (a bill, a utility such as LUKU electricity, a government or betting payment), BALANCE_UPDATE (only a balance), OTP, PROMOTIONAL, SECURITY_ALERT or OTHER.
- is_money is true only for a completed money movement: false for OTPs, promotions, balance checks, alerts, and failed or pending transactions.
- amount is the transaction amount: not the fee, not the balance.
- fee is the charge as the message states it ("Ada", "Makato", "Gharama", "Fee", "Charges"), including any VAT the message says is inside it. null when none is stated.
- taxes lists each tax the message itemises (VAT, excise duty, government levy, EWURA, REA). within is "fee" when the tax is part of the stated fee ("Ada TSh 495. VAT TSh 76"), "amount" when it is inside the amount paid (a LUKU receipt), and "extra" when it is charged on top of both.
- counterparty is the other party's name as written: a person, business, agent or bank. null when none.
- counterparty_number is their phone, account or Lipa number exactly as written. Numbers are already partly masked with asterisks: keep them that way.
- reference is the transaction ID exactly as written ("Muamala", "Kumbukumbu no", "TxnId", "Ref", "Receipt", or the code the message opens with).
- balance_after is the balance after the transaction, when stated.
- date is YYYY-MM-DD and time is HH:MM (24-hour), when stated. A two-digit year is 20xx; day comes before month.
- provider is the service that sent the message, such as "M-Pesa", "Mixx by Yas", "Airtel Money" or "CRDB Bank". null when you can't tell.
- money_category is what the money was for, from the list; null when is_money is false.
- merchant is true when the money went to a business, till or Lipa number rather than a person.
- network is the network or bank the money went to, when the message names one different from the sender's.
- unsure lists the fields you had to interpret and might have wrong.`;

const nullable = (type: string) => ({ type: [type, 'null'] });

export const TOOL = {
  name: 'record_messages',
  description: 'Record what each SMS says about money: one result per message, by id.',
  input_schema: {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            is_money: { type: 'boolean' },
            category: { type: 'string', enum: MESSAGE_CATEGORIES },
            provider: nullable('string'),
            amount: nullable('number'),
            currency: nullable('string'),
            fee: nullable('number'),
            taxes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  code: { type: 'string', enum: TAX_CODES },
                  amount: { type: 'number' },
                  rate_pct: nullable('number'),
                  within: { type: 'string', enum: TAX_PLACES },
                },
                required: ['code', 'amount', 'within'],
              },
            },
            counterparty: nullable('string'),
            counterparty_number: nullable('string'),
            reference: nullable('string'),
            balance_after: nullable('number'),
            date: { ...nullable('string'), description: 'YYYY-MM-DD' },
            time: { ...nullable('string'), description: 'HH:MM, 24-hour' },
            money_category: { type: ['string', 'null'], enum: [...MONEY_CATEGORIES, null] },
            merchant: { type: 'boolean' },
            network: nullable('string'),
            unsure: { type: 'array', items: { type: 'string', enum: FIELD_KEYS } },
          },
          required: [
            'id',
            'is_money',
            'category',
            'provider',
            'amount',
            'fee',
            'taxes',
            'counterparty',
            'reference',
            'balance_after',
            'date',
            'time',
            'money_category',
            'merchant',
            'unsure',
          ],
        },
      },
    },
    required: ['results'],
  },
} as const;

/** Message text can't close its own tag and pose as another message. */
const inert = (s: string) => s.replace(/</g, '‹').replace(/>/g, '›');

export function buildRequest(messages: readonly IncomingMessage[]) {
  const listing = messages
    .map(
      (m) =>
        `<message id="${inert(m.id)}"${m.sender ? ` sender="${inert(m.sender).replace(/"/g, "'")}"` : ''}>\n${inert(m.text)}\n</message>`,
    )
    .join('\n');
  return {
    model: MODEL,
    max_tokens: Math.min(8192, 600 + messages.length * 400),
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [
      {
        role: 'user',
        content: `Record ${messages.length === 1 ? 'this message' : `these ${messages.length} messages`}.\n\n${listing}`,
      },
    ],
  };
}

/** What the app gets back for one message. */
export interface Reading {
  id: string;
  isMoney: boolean;
  category: MessageCategory;
  provider: string | null;
  amount: number | null;
  currency: string | null;
  fee: number | null;
  taxes: { code: TaxCode; amount: number; ratePct: number | null; within: TaxPlace }[];
  counterparty: string | null;
  counterpartyNumber: string | null;
  reference: string | null;
  balanceAfter: number | null;
  date: string | null;
  time: string | null;
  moneyCategory: MoneyCategory | null;
  merchant: boolean;
  network: string | null;
  unsure: FieldKey[];
}

const text = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

const amountOf = (v: unknown): number | null => {
  const n = typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n < 1e12
    ? Math.round(n * 100) / 100
    : null;
};

const oneOf = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;

function dateOf(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  return day.getUTCMonth() === m - 1 && day.getUTCDate() === d ? v : null;
}

function timeOf(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** One result from Claude, kept only if it has an id and a known category. */
function readingOf(raw: unknown): Reading | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const id = text(r.id, 64);
  const category = oneOf(r.category, MESSAGE_CATEGORIES);
  if (!id || !category) return null;

  const taxes = Array.isArray(r.taxes)
    ? r.taxes.flatMap((t) => {
        const tax = (t ?? {}) as Record<string, unknown>;
        const code = oneOf(tax.code, TAX_CODES);
        const within = oneOf(tax.within, TAX_PLACES);
        const amount = amountOf(tax.amount);
        return code && within && amount != null
          ? [{ code, amount, ratePct: amountOf(tax.rate_pct), within }]
          : [];
      })
    : [];
  const unsure = Array.isArray(r.unsure)
    ? [...new Set(r.unsure.flatMap((k) => oneOf(k, FIELD_KEYS) ?? []))]
    : [];

  return {
    id,
    isMoney: r.is_money === true,
    category,
    provider: text(r.provider, 60),
    amount: amountOf(r.amount),
    currency: text(r.currency, 8),
    fee: amountOf(r.fee),
    taxes,
    counterparty: text(r.counterparty),
    counterpartyNumber: text(r.counterparty_number, 40),
    reference: text(r.reference, 40),
    balanceAfter: amountOf(r.balance_after),
    date: dateOf(r.date),
    time: timeOf(r.time),
    moneyCategory: oneOf(r.money_category, MONEY_CATEGORIES),
    merchant: r.merchant === true,
    network: text(r.network, 60),
    unsure,
  };
}

/** Claude's answer, checked: one reading per requested id at most, the rest dropped. */
export function readResults(answer: unknown, ids: readonly string[]): Reading[] {
  const content = (answer as { content?: unknown } | null)?.content;
  if (!Array.isArray(content)) return [];
  const call = content.find(
    (c) =>
      (c as { type?: unknown })?.type === 'tool_use' &&
      (c as { name?: unknown }).name === TOOL.name,
  ) as { input?: { results?: unknown } } | undefined;
  const results = call?.input?.results;
  if (!Array.isArray(results)) return [];

  const wanted = new Set(ids);
  const readings: Reading[] = [];
  for (const raw of results) {
    const reading = readingOf(raw);
    if (reading && wanted.has(reading.id)) {
      readings.push(reading);
      wanted.delete(reading.id);
    }
  }
  return readings;
}
