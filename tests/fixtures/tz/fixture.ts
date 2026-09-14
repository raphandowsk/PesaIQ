/**
 * One regression fixture for the Tanzania mobile-money parser (§39).
 *
 * EVERY NAME, NUMBER, CODE AND BALANCE IN THESE FIXTURES IS INVENTED. The
 * layouts follow the specification's documented examples; its real names and
 * numbers are never reused. `evidence` says where a layout comes from (§56):
 *
 * - A: a real Tanzanian example or official documentation, re-filled with
 *   invented values
 * - B: a public example still to be checked against real phones
 * - LOCAL: the owner's own messages, anonymized (tests/fixtures/tz-messages.ts)
 * - ASSUMED: no raw message seen; written to exercise one rule, and not a
 *   claim about the operator's format
 */
export interface TzFixture {
  id: string;
  evidence: 'A' | 'B' | 'LOCAL' | 'ASSUMED';
  sender?: string;
  sms: string;
  /**
   * `transaction`: read as one. `unknown`: an operator recognized it, but it
   * is not a transaction to trust. `none`: no operator recognized it.
   */
  outcome: 'transaction' | 'unknown' | 'none';
  /** Matched against the reading with toMatchObject. */
  expected?: Record<string, unknown>;
}
