/**
 * Mixx by Yas and LUKU messages in their real layouts, anonymized.
 *
 * The layouts come from messages the user supplied on 2026-09-12. Every name,
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

  /** A LUKU receipt: meter, reference, units, token, then itemised lines to the TOTAL. */
  lukuReceipt:
    'Malipo yamekamilika.14200000001\n9000000000000000001\n51.9KWH\n\n1111 2222 3333 4444 5555 \n\nCost 15,163.94\nVAT 18% 2729.50\nEWURA 1% 151.64\nREA 3% 454.92\nDebt Collected 1500.00\nTOTAL 20,000.00 12/09/26 08:16.LKS',
} as const;
