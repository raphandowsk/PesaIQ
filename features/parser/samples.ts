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
  // The next three follow real Mixx and LUKU layouts (see
  // tests/fixtures/tz-messages.ts); every name and number in them is invented.
  {
    id: 's5',
    name: 'Mixx - sent, with fee and VAT',
    badge: 'MX',
    hint: 'Real Mixx layout: the VAT sits inside the fee',
    sender: 'DEMO-MIXX',
    text: `${DEMO_PREFIX}\nUmetuma TSh 10,000 kwenda kwa mpokeaji wa Halo Pesa NEEMA ALLY OMARI - 255620000456. Ada TSh 495. VAT TSh 76. Salio jipya ni TSh 243,000. Muamala: 26700000000004. 12/09/26 14:25. Tafadhali subiri.`,
  },
  {
    id: 's6',
    name: 'Mixx - Lipa payment',
    badge: 'LP',
    hint: 'A fuel station on a Lipa number',
    sender: 'DEMO-MIXX',
    text: `${DEMO_PREFIX}\nUmetuma TSh 15,000 kwenda kwa mpokeaji wa Vodacom LIPA TOTALENERGIES - KUNDUCHI SERVICE STATION - 60000789. Ada TSh 1,000. VAT TSh 153. Salio jipya ni TSh 5,000. Muamala: 26600000000006. 12/09/26 13:18.`,
  },
  {
    id: 's7',
    name: 'LUKU electricity receipt',
    badge: 'LK',
    hint: 'Units, token, and VAT, EWURA and REA lines',
    sender: 'DEMO-LUKU',
    text: `${DEMO_PREFIX}\nMalipo yamekamilika.14200000001\n9000000000000000001\n51.9KWH\n1111 2222 3333 4444 5555\nCost 15,163.94\nVAT 18% 2729.50\nEWURA 1% 151.64\nREA 3% 454.92\nDebt Collected 1500.00\nTOTAL 20,000.00 12/09/26 08:16`,
  },
];

export const getSample = (id: string): SmsSample | undefined => SAMPLES.find((s) => s.id === id);
