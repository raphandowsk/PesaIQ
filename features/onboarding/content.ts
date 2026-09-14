/**
 * Onboarding copy, verbatim from the 2026-09-11 design canvas.
 *
 * Kept out of the screens so it can be tested. The privacy screen makes
 * promises about how the app behaves, and `tests/onboarding.test.ts` holds that
 * copy to what the app actually does.
 */

export const WELCOME = {
  title: 'Turn SMS notifications into organized financial records.',
  body: 'Built for Tanzanian mobile money and bank messages. Amounts in TZS.',
} as const;

export interface HowStep {
  n: string;
  title: string;
  body: string;
}

export const HOW_STEPS: readonly HowStep[] = [
  { n: '1', title: 'Message', body: 'A message arrives, or you paste one in' },
  { n: '2', title: 'Understand', body: 'The kind of transaction is recognized' },
  { n: '3', title: 'Extract', body: 'Amount, name, reference and date' },
  { n: '4', title: 'Organize', body: 'Clean records, held on your phone' },
];

export const PRIVACY_POINTS: readonly string[] = [
  'Stage 1 processes only the messages you paste in.',
  'A future Android version may read incoming SMS, with your permission.',
  'Messages you analyze are read by Claude, an AI from Anthropic. Phone, account and card numbers are masked on this phone first.',
  "PesaIQ's server passes each message to Claude and keeps no copy. Your records stay on this phone unless you turn on Cloud sync.",
  'You can delete your transactions, messages and history at any time.',
];

export const PRIVACY_DISCLAIMER =
  'This screen describes how the app behaves. It is not a legal, compliance or app-store approval statement.';

export const SETUP_COPY = {
  title: 'Which senders matter?',
  // "Watch", not "parse": in Stage 1 every pasted message is analyzed regardless.
  // The choice decides which incoming senders Stage 2 will read. Decided 2026-09-11.
  body: 'Choose the providers PesaIQ should watch. You can change this later in Settings.',
  maturity: 'All parsers ship as DEMO',
  note: 'Stage 1 reads only messages you paste in. Nothing is intercepted.',
} as const;
