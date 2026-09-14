import type { TzFixture } from './fixture';

const CAUTION = 'T-PESA is known from one public example so far. Check the details.';

/**
 * T-PESA. One public example exists (§22), in a layout shared with three
 * other operators: these fixtures check it is read as T-PESA only with the
 * sender ID or the name, and never claimed on the layout alone.
 */
export const TPESA: TzFixture[] = [
  {
    id: 'tpesa/public-example-001',
    evidence: 'B',
    sender: 'T-PESA',
    sms: 'Umetuma pesa kwa ZAWADI MREMA,\nkiasi Tsh 44,000/=,\nAda ----',
    outcome: 'transaction',
    expected: {
      operator: 'TPESA_TZ',
      transactionType: 'SENT',
      amount: 44000,
      fee: null,
      recipient: { name: 'ZAWADI MREMA', phone: null },
      template: 'TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE',
      confidence: 0.75,
      warnings: expect.arrayContaining([CAUTION]),
    },
  },
  {
    id: 'tpesa/public-example-002',
    evidence: 'B',
    sender: 'TPESA',
    sms: 'Umetuma pesa kwa JOSEPH MAKOYE,\nkiasi TZS 12,500/=,\nAda ----',
    outcome: 'transaction',
    expected: { operator: 'TPESA_TZ', amount: 12500, recipient: { name: 'JOSEPH MAKOYE' } },
  },
  {
    id: 'tpesa/public-example-003',
    evidence: 'B',
    sender: 'TTCL',
    sms: 'Umetuma pesa kwa MARIAMU HAJI, kiasi Tsh 7,000/-, Ada ----',
    outcome: 'transaction',
    expected: { operator: 'TPESA_TZ', amount: 7000, recipient: { name: 'MARIAMU HAJI' } },
  },
  {
    id: 'tpesa/name-only-001',
    evidence: 'B',
    sms: 'T-PESA: Umetuma pesa kwa ANDREA MUSHI, kiasi Tsh 3,000/=, Ada ----',
    outcome: 'transaction',
    // The name alone is one signal: the operator is likely, not detected.
    expected: { operator: 'TPESA_TZ', amount: 3000, confidence: 0.5 },
  },
  {
    id: 'tpesa/with-fee-001',
    evidence: 'B',
    sender: 'T-PESA',
    sms: 'Umetuma pesa kwa ISSA RAMADHANI,\nkiasi Tsh 20,000/=,\nAda Tsh 350',
    outcome: 'transaction',
    expected: { amount: 20000, fee: 350, recipient: { name: 'ISSA RAMADHANI' } },
  },
  {
    id: 'tpesa/with-reference-001',
    evidence: 'B',
    sender: 'T-PESA',
    sms: 'Umetuma pesa kwa LUCY MBWAMBO,\nkiasi Tsh 15,000/=,\nAda ----\nKumbukumbu Namba TP2409150001',
    outcome: 'transaction',
    expected: { amount: 15000, transactionId: 'TP2409150001', confidence: 0.9 },
  },
  {
    id: 'tpesa/with-phone-001',
    evidence: 'B',
    sender: 'T-PESA',
    sms: 'Umetuma pesa kwa PENDO KIMARO 0730000222,\nkiasi Tsh 9,000/=,\nAda ----\nKumbukumbu Namba TP2409150002',
    outcome: 'transaction',
    expected: {
      amount: 9000,
      recipient: { name: 'PENDO KIMARO', phone: '07** *** 222' },
      transactionId: 'TP2409150002',
    },
  },
  {
    id: 'tpesa/untidy-spacing-001',
    evidence: 'B',
    sender: ' t-pesa ',
    sms: 'umetuma   pesa kwa  NASRA  ALI ,\n\n\n\nkiasi tsh 2,500/= ,\nada ----',
    outcome: 'transaction',
    expected: { operator: 'TPESA_TZ', amount: 2500, recipient: { name: 'NASRA ALI' } },
  },
  {
    id: 'tpesa/shared-layout-no-sender-001',
    evidence: 'B',
    sms: 'Umetuma pesa kwa ZAWADI MREMA,\nkiasi Tsh 44,000/=,\nAda ----',
    // Documented for four operators: without a sender or a name, it is none of them.
    outcome: 'none',
  },
  {
    id: 'tpesa/shared-layout-mpesa-sender-001',
    evidence: 'B',
    sender: 'M-PESA',
    sms: 'Umetuma pesa kwa ZAWADI MREMA,\nkiasi Tsh 44,000/=,\nAda ----',
    outcome: 'transaction',
    expected: { operator: 'MPESA_TZ', template: 'SHARED_SENT_KIASI' },
  },
  {
    id: 'tpesa/promotion-001',
    evidence: 'ASSUMED',
    sender: 'TPESA',
    sms: 'T-PESA: Jiunge na ofa ya bando! Piga *150*71#',
    outcome: 'unknown',
    expected: { operator: 'TPESA_TZ', nonTransaction: 'PROMOTIONAL' },
  },
];
