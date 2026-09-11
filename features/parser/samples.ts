/**
 * Demo messages for the Parser Lab and the test fixtures.
 *
 * EVERY MESSAGE HERE IS INVENTED. They are not captured from real customers and
 * they do not reproduce any provider's live SMS format. Names, phone numbers,
 * account numbers and references are fabricated. Each one carries a visible
 * "DEMO SAMPLE (anonymized)" first line so it cannot be mistaken for real data
 * anywhere it is displayed.
 */

export interface SmsSample {
  id: string;
  name: string;
  /** Two-letter chip shown on the Lab button. */
  badge: string;
  /** One-line description of what this sample exercises. */
  hint: string;
  sender: string;
  text: string;
}

const DEMO_PREFIX = 'DEMO SAMPLE (anonymized)';

export const SAMPLES: SmsSample[] = [
  {
    id: 's1',
    name: 'Mobile money - received',
    badge: 'MM',
    hint: 'TZS 250,000 from a person, with reference',
    sender: 'DEMO-WALLET-A',
    text: `${DEMO_PREFIX}\nYou have received TZS 250,000.00 from JOHN MWAKASEGE 0712345678 on 12/03/26 at 14:22. Ref: QH42T8LM9P. New balance TZS 812,400.00.`,
  },
  {
    id: 's2',
    name: 'Mobile money - sent (Swahili)',
    badge: 'SW',
    hint: 'Swahili wording, with balance and fee',
    sender: 'DEMO-WALLET-B',
    text: `${DEMO_PREFIX}\nUmetuma TZS 45,000 kwa GRACE KIMARO 0687776887. Muamala 8FR2K1DD. Salio TZS 133,900. Ada TZS 1,000.`,
  },
  {
    id: 's3',
    name: 'Bank - ATM withdrawal',
    badge: 'BK',
    hint: 'Account debited, no counterparty name',
    sender: 'DEMO-BANK',
    text: `${DEMO_PREFIX}\nAcct ****4312 debited TZS 120,000.00 ATM withdrawal 11/03/26 09:07. Avail bal TZS 2,415,300.00. TxnID BK7741902.`,
  },
  {
    id: 's4',
    name: 'Unknown - promotional',
    badge: '??',
    hint: 'No amount, no reference - lands in review',
    sender: 'DEMO-PROMO',
    text: `${DEMO_PREFIX}\nKaribu! Bonasi ya 20% kwa kila bando unalonunua wiki hii. Bofya *149*88# kujiunga.`,
  },
];

export const getSample = (id: string): SmsSample | undefined => SAMPLES.find((s) => s.id === id);
