/**
 * The fixture-driven regression suite for the Tanzania mobile-money parser
 * (§39). Every fixture in tests/fixtures/tz runs here; adding a layout is
 * adding a fixture. See docs/PARSER_ENGINE.md, "Adding a template".
 */
import { parseTanzaniaSms, PARSER_VERSION } from '../features/parser/tz';
import { AIRTEL } from './fixtures/tz/airtel';
import type { TzFixture } from './fixtures/tz/fixture';
import { HALOPESA } from './fixtures/tz/halopesa';
import { MIXX } from './fixtures/tz/mixx';
import { MPESA } from './fixtures/tz/mpesa';
import { TPESA } from './fixtures/tz/tpesa';

const SETS: [string, TzFixture[]][] = [
  ['M-Pesa', MPESA],
  ['Airtel Money', AIRTEL],
  ['Mixx by Yas', MIXX],
  ['HaloPesa', HALOPESA],
  ['T-PESA', TPESA],
];

/** A full Tanzanian phone number, however written. */
const FULL_PHONE = /(?:\+?255\s?|\b0)[67]\d{2}\s?\d{3}\s?\d{3}\b/;

describe.each(SETS)('%s fixtures', (_, fixtures) => {
  it('has at least ten', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))('%s', (_id, f) => {
    const outcome = parseTanzaniaSms({ body: f.sms, sender: f.sender });

    if (f.outcome === 'none') {
      expect(outcome).toBeNull();
      return;
    }
    expect(outcome?.kind).toBe(f.outcome);
    if (!outcome) return;

    const tx = outcome.kind === 'transaction' ? outcome.transaction : outcome.closest;
    expect(tx).toMatchObject({
      parserVersion: PARSER_VERSION,
      currency: 'TZS',
      parsed: true,
      verified: false,
      ...f.expected,
    });

    // Only the message itself may hold a full number: every field is masked.
    const { rawSms, ...fields } = tx;
    expect(rawSms).toBe(f.sms);
    expect(JSON.stringify(fields)).not.toMatch(FULL_PHONE);
  });
});

it('keeps every fixture anonymized: none of the specification’s real names or numbers', () => {
  const all = SETS.flatMap(([, f]) => f)
    .map((f) => f.sms)
    .join('\n');
  for (const real of [
    'JUMA KAPUYA',
    'ALPHONCE GASPERY',
    'GODFREY MASIMA',
    'ABDURAHMAN',
    '762 461 626',
    '255717463576',
    'CFN2INTMYS8',
    'T54G0596',
    'R93NY448',
    '3122725997',
    '922749',
    '3937355',
  ]) {
    expect(all).not.toContain(real);
  }
});
