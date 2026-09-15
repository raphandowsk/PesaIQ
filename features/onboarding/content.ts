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
  'The app processes only messages you paste in, or share to PesaIQ from your messages app.',
  "PesaIQ's server holds your mobile number, to sign you in, and the list of phones signed in with it.",
  "Cloud sync is optional and off by default. Turned on, your records are kept on the server too, locked so it can't read them.",
  'You can delete your transactions, messages and history at any time.',
];

export const SETUP_COPY = {
  title: 'Which senders matter?',
  // "Watch", not "parse": in Stage 1 every pasted message is analyzed regardless.
  // The choice decides which incoming senders Stage 2 will read. Decided 2026-09-11.
  body: 'Choose the providers PesaIQ should watch. You can change this later in Settings.',
  maturity: 'Mobile money · EXPERIMENTAL',
} as const;
