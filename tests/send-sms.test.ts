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
} from '../supabase/functions/send-sms/logic';

// Invented numbers only.
const sent = (groupId: number, id: number, name = '') => ({
  messages: [{ to: '255700000111', status: { groupId, groupName: '', id, name }, smsCount: 1 }],
});

describe('send-sms: who gets a code', () => {
  it('accepts Tanzanian mobile numbers however they are written', () => {
    expect(tanzanianMobile('255700000111')).toBe('255700000111');
    expect(tanzanianMobile('+255 700 000 111')).toBe('255700000111');
    expect(tanzanianMobile('0700000111')).toBe('255700000111');
    expect(tanzanianMobile('255600000111')).toBe('255600000111');
  });

  it('refuses other countries, landlines and incomplete numbers', () => {
    expect(tanzanianMobile('254700000111')).toBeNull(); // Kenya
    expect(tanzanianMobile('255220000111')).toBeNull(); // Dar es Salaam landline
    expect(tanzanianMobile('25570000011')).toBeNull();
    expect(tanzanianMobile('')).toBeNull();
    expect(tanzanianMobile(undefined)).toBeNull();
  });

  it('never logs a whole number', () => {
    expect(maskNumber('255700000111')).toBe('255******111');
  });
});

describe('send-sms: what is sent, and where', () => {
  it('sends the agreed English text from NEXTSMS', () => {
    expect(codeMessage('123456')).toBe("PesaIQ: your code is 123456. Don't share it with anyone.");
    expect(SENDER_ID).toBe('NEXTSMS');
    // One SMS: well under 160 characters.
    expect(codeMessage('123456').length).toBeLessThan(160);
  });

  it('uses the free test endpoint unless told "live"', () => {
    expect(modeFrom(undefined)).toBe('test');
    expect(modeFrom('')).toBe('test');
    expect(modeFrom('yes')).toBe('test');
    expect(modeFrom(' LIVE ')).toBe('live');
    expect(TEST_URL).toContain('/test/');
    expect(LIVE_URL).not.toContain('/test/');
  });
});

describe("send-sms: reading the provider's answer", () => {
  it('counts pending and delivered messages as sent', () => {
    expect(outcomeOf(sent(18, 51, 'ENROUTE (SENT)'))).toEqual({
      ok: true,
      status: '51 ENROUTE (SENT)',
    });
    expect(outcomeOf(sent(20, 73, 'DELIVERED')).ok).toBe(true);
  });

  it('asks the user to try later when the account cannot send', () => {
    for (const id of [56, 57, 58, 62]) {
      const o = outcomeOf(sent(id === 57 ? 22 : 19, id));
      expect(o.ok).toBe(false);
      if (!o.ok) expect(o.error.http_code).toBe(503);
    }
  });

  it('says so when a number gets too many codes', () => {
    const o = outcomeOf(sent(19, 63, 'REJECTED_FLOODING_FILTER'));
    expect(o).toMatchObject({ ok: false, error: { http_code: 429 } });
  });

  it('asks the user to check a number the networks refuse', () => {
    expect(outcomeOf(sent(19, 69))).toMatchObject({ ok: false, error: { http_code: 400 } });
    expect(outcomeOf(sent(20, 76, 'UNDELIVERABLE'))).toMatchObject({
      ok: false,
      error: { http_code: 400 },
    });
  });

  it('treats a missing or unreadable answer as not sent', () => {
    expect(outcomeOf(null)).toMatchObject({ ok: false, status: 'no status' });
    expect(outcomeOf({ messages: [] })).toMatchObject({ ok: false, error: { http_code: 502 } });
  });

  it('maps HTTP errors without exposing why', () => {
    expect(providerHttpError(401).http_code).toBe(503);
    expect(providerHttpError(429).http_code).toBe(429);
    expect(providerHttpError(500).http_code).toBe(502);
    expect(providerHttpError(401).message).not.toMatch(/token|credit|sender/i);
  });
});
