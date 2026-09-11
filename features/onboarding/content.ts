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
  'Financial data is sensitive, so parsing runs on this device where possible.',
  'Cloud sync and AI processing are optional and off by default.',
  'You can delete your transactions, messages and history at any time.',
];

export const PRIVACY_DISCLAIMER =
  'This screen describes how the app behaves. It is not a legal, compliance or app-store approval statement.';

export const SETUP_COPY = {
  title: 'Which senders matter?',
  body: 'Choose the providers you want parsed. You can change this later in Settings.',
  maturity: 'All parsers ship as DEMO',
  note: 'Stage 1 reads only messages you paste in. Nothing is intercepted.',
} as const;
