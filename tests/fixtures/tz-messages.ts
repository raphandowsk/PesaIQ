/**
 * Mixx by Yas and LUKU messages in their real layouts, anonymized.
 *
 * The layouts come from messages the user supplied on 2026-09-12, 2026-09-15,
 * 2026-09-19 and 2026-09-22. Every name,
 * phone number, Lipa number, reference, receipt, balance, meter number and
 * token has been replaced with an invented one. The fee and VAT figures are
 * tariff amounts, kept as they were so the arithmetic checks are real; the
 * LUKU lines keep their real proportions for the same reason.
 */
export const TZ = {
  /** "Umetuma kikamilifu ... LIPA": a merchant's Lipa number, VAT inside "Jumla ya makato". */
  mixxLipaMerchant:
    'Umetuma kikamilifu TSh 5,000 kwenda kwa Vodacom LIPA ASHA JUMA MREMA-51234567. Jumla ya makato TSh 450, VAT TSh 69. Salio jipya ni TSh120,550. Namba ya muamala: 26700000000001. Risiti: 503-TESTAB12CD. 12/09/26 16:00. Kila Muamala ni Bao la Ushindi!',

  /** The same layout, to a person on another network. */
  mixxToPerson:
    'Umetuma kikamilifu TSh 110,357 kwenda kwa Vodacom JUMA SAIDI HAMISI-255700000123. Jumla ya makato TSh 1,440, VAT TSh 220. Salio jipya ni TSh126,000. Namba ya muamala: 26100000000003. Risiti: 503-TESTCD34EF. 12/09/26 15:45. Kila Muamala ni Bao la Ushindi!',

  /** "mpokeaji wa": a person on another network, VAT inside "Ada". */
  mixxToOtherNetwork:
    'Umetuma TSh 10,000 kwenda kwa mpokeaji wa Halo Pesa NEEMA ALLY OMARI - 255620000456. Ada TSh 495. VAT TSh 76. Salio jipya ni TSh 243,000. Muamala: 26700000000004. 12/09/26 14:25. Tafadhali subiri. Furahia Punguzo kubwa la bei unapofanya miamala ya Mixx.LKS',

  /** "mpokeaji wa ... LIPA": a fuel station's Lipa number, whose name contains " - ". */
  mixxLipaFuel:
    'Umetuma TSh 15,000 kwenda kwa mpokeaji wa Vodacom LIPA TOTALENERGIES - KUNDUCHI SERVICE STATION - 60000789. Ada TSh 1,000. VAT TSh 153. Salio jipya ni TSh 5,000. Muamala: 26600000000006. 12/09/26 13:18. Tafadhali subiri. Furahia Punguzo kubwa la bei unapofanya miamala ya Mixx.LKS',

  /** "Malipo yamekamilika kwenda ...": a payment to a business, reference as "Kumbukumbu no.". */
  mixxBetting:
    'Malipo yamekamilika kwenda HELABET, Kiasi Tsh32,000. Salio jipya ni Tsh 210,400. Ada Tsh 600. VAT TSh 92. Kumbukumbu no.26200000000002. 12/09/26 15:40.',

  mixxBettingSmall:
    'Malipo yamekamilika kwenda HELABET, Kiasi Tsh20,000. Salio jipya ni Tsh 9,500. Ada Tsh 500. VAT TSh 76. Kumbukumbu no.26700000000005. 12/09/26 09:21.',

  /**
   * "Umelipa ... kwenda kwa NAME": paying a Mixx Lipa number, reference as
   * "Kumbukumbu no.: " with two separators (supplied 2026-09-15). The app links
   * in the sign-off are replaced too.
   */
  mixxLipaUmelipa:
    'Umelipa TSh 75,000 kwenda kwa NURU. Ada TSh 1,700. VAT TSh 259. Kumbukumbu no.: 26100000000014. 15/09/26 16:05. Salio lako jipya ni TSh 318,400. Kila Muamala ni Bao la Ushindi!. Bonyeza goo.gl/abcdef au iPhone apple.co/1abcDEF kupakua Mixx by Yas App',

  /** "mpokeaji wa Vodacom LIPA": a shop's Vodacom Lipa number (supplied 2026-09-15). */
  mixxLipaVodacomShop:
    'Umetuma TSh 3,000 kwenda kwa mpokeaji wa Vodacom LIPA BARAKA GENERAL STORE - 54000123. Ada TSh 100. VAT TSh 15. Salio jipya ni TSh 404,120. Muamala: 26900000000023. 15/09/26 08:40. Tafadhali subiri. Furahia Punguzo kubwa la bei unapofanya miamala ya Mixx.LKS',

  /**
   * Cash-out at an agent ("Umetuma pesa kwa Wakala - NAME"): the total charges
   * are the fee plus a government levy ("Jumla ya Makato … (Ada …, Tozo …)"),
   * and the VAT is 18% of the fee alone (supplied 2026-09-19).
   */
  mixxCashOut:
    'Salio lako jipya ni TSh 88,300. Umetuma pesa kwa Wakala - BARAKA AGENCIES, kiasi TSh 15,000. Jumla ya Makato TSh 1,645. (Ada TSh 1,450, Tozo TSh 195), VAT TSh 221. Kumbukumbu No.: 26700000000021. 18/09/26 10:49.',

  mixxCashOutLarge:
    'Salio lako jipya ni TSh 520. Umetuma pesa kwa Wakala - HALIMA JUMA, kiasi TSh 50,000. Jumla ya Makato TSh 3,273. (Ada TSh 2,700, Tozo TSh 573), VAT TSh 412. Kumbukumbu No.: 26600000000022. 19/09/26 07:50.',

  /**
   * HaloPesa's English layout ("SUCCESSFUL! Tnx …"), supplied 2026-09-22.
   * Paying a Vodacom Lipa number through M-Pesa: the Lipa number follows
   * "Ref", and the fee is written "fee: 60 TZS".
   */
  haloSentMpesaLipa:
    'SUCCESSFUL!\nTnx 6260000000000011. Sent 1,000 TZS to M-Pesa, name LIPA ZAINABU HAMZA KILEO (Ref 54000321), fee: 60 TZS at 22/09/2026 07:58:03.\nNew balance: 3,780.00 TZS.',

  /** The same layout buying LUKU electricity for a meter. */
  haloLuku:
    'SUCCESSFUL!\nTnx 6260000000000012. Bought LUKU 4,000 TZS for meter 24300000111 at 20/09/2026 23:39:36. Fee: 80 TZS. \nNew balance: 5,920.00 TZS.',

  /** Sent to a person on another network: the number and network in brackets. */
  haloSentMixx:
    'SUCCESSFUL!\nTnx 6260000000000013. Sent 1,000 TZS to NEEMA KIMARO (0713000123, Mixx by Yas) at 21/09/2026 19:37:06. Content: NEEMA DANIEL KIMARO transfer from HaloPesa. Fee: 40 TZS.\nNew balance: 4,880.00 TZS.',

  /** Received from another network, with no "SUCCESSFUL!" heading. */
  haloReceivedAirtel:
    'Tnx 6260000000000014. Received 1,000 TZS from NEEMA DANIEL KIMARO (255660000456) via Airtel Money at 21/09/2026 19:41:00. Content: Halopesa.\nNew balance: 5,880.00 TZS.',

  haloSentAirtel:
    'SUCCESSFUL!\nTnx 6260000000000015. Sent 1,000 TZS to NEEMA DANIEL KIMARO (0660000456, Airtel Money) at 21/09/2026 19:42:40. Content: NEEMA DANIEL KIMARO transfer from HaloPesa. Fee: 40 TZS.\nNew balance: 4,840.00 TZS.',

  /**
   * Airtel Money's own layouts, supplied 2026-09-22. The reference is
   * labelled "TID:", and one payment arrives twice: in English with the
   * charges broken down, and in Swahili through TIPS, both with the same TID.
   */
  airtelLipaQr:
    'Umelipa 2,000 Tsh kwa VODALIPA TNQR.LIPA ZAINABU HAMZA KILEO. 54000321, Makato Tsh 70.00. Salio 6,840.00 Tsh. TID:XX260922.0754.A11111',

  airtelTipsLipa:
    'Umelipa 2,000.00 Tsh kwenda TIPS TIPS. Makato Tsh 70.00. Salio 6,840.00 Tsh TID:XX260922.0754.A11111',

  airtelReceived:
    'Umepokea Tsh 1,000.00 kutoka kwa NEEMA DANIEL KIMARO . Salio Tsh8,910.00. TID: XX260921.1942.B22222',

  airtelPaidPerson:
    'Paid 1000.00 TZS to 255617000789 NEEMA DANIEL KIMARO. Charges Tsh 45.00 (Service charge Tsh 45.00 + Govt Levy Tsh 0.00). Balance 7,910.00 Tsh. TID:XX260921.1940.C33333',

  airtelPaidPersonLocal:
    'Paid 1000.00 TZS to 0713000123 NEEMA KIMARO. Charges Tsh 45.00 (Service charge Tsh 45.00 + Govt Levy Tsh 0.00). Balance 8,955.00 Tsh. TID:XX260921.1935.D44444',

  airtelTipsSmall:
    'Umelipa 1,000.00 Tsh kwenda TIPS TIPS. Makato Tsh 45.00. Salio 7,910.00 Tsh TID:XX260921.1940.C33333',

  /** A LUKU receipt: meter, reference, units, token, then itemised lines to the TOTAL. */
  lukuReceipt:
    'Malipo yamekamilika.14200000001\n9000000000000000001\n51.9KWH\n\n1111 2222 3333 4444 5555 \n\nCost 15,163.94\nVAT 18% 2729.50\nEWURA 1% 151.64\nREA 3% 454.92\nDebt Collected 1500.00\nTOTAL 20,000.00 12/09/26 08:16.LKS',
} as const;
