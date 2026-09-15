/**
 * Onboarding copy, verbatim from the 2026-09-11 design canvas.
 *
 * Kept out of the screens so it can be tested. The privacy screen makes
 * promises about how the app behaves, and `tests/onboarding.test.ts` holds that
 * copy to what the app actually does.
 */

export const WELCOME = {
  title: 'Turn SMS notifications into organized financial records.',
} as const;

export interface HowStep {
  n: string;
  title: string;
  body: string;
}

export const HOW_STEPS: readonly HowStep[] = [
  { n: '1', title: 'Message', body: 'Share or paste a message to the app' },
  { n: '2', title: 'Understand', body: 'The kind of transaction is recognized' },
  { n: '3', title: 'Extract', body: 'Amount, name, reference and date' },
  { n: '4', title: 'Organize', body: 'Clean records, held on your phone' },
];

export const PRIVACY_POINTS: readonly string[] = [
  'Stage 1 processes only the messages you paste in, or share to PesaIQ from your messages app.',
  'A future Android version may read incoming SMS, with your permission.',
  "Messages are read on this phone by PesaIQ's own rules, and never leave it. None is sent to an AI.",
  "PesaIQ's server holds your mobile number, to sign you in, and the list of phones signed in with it.",
  "Cloud sync is optional and off by default. Turned on, your records are kept on the server too, locked so it can't read them.",
  'You can delete your transactions, messages and history at any time.',
];

export const PRIVACY_DISCLAIMER =
  'This screen describes how the app behaves. It is not a legal, compliance or app-store approval statement.';

export const SETUP_COPY = {
  title: 'Which senders matter?',
  // "Watch", not "parse": in Stage 1 every pasted message is analyzed regardless.
  // The choice decides which incoming senders Stage 2 will read. Decided 2026-09-11.
  body: 'Choose the providers PesaIQ should watch. You can change this later in Settings.',
  maturity: 'Mobile money EXPERIMENTAL · banks DEMO',
  note: 'Stage 1 reads only messages you paste in or share to it. Nothing is intercepted.',
} as const;
