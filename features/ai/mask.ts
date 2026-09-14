/**
 * What leaves the phone for AI reading: the message, with phone numbers,
 * account, card and meter numbers, and LUKU tokens masked. References stay,
 * since they tell one transaction from another, and so do names and amounts,
 * which the AI is there to read.
 */
import { maskNumber } from '../../utils/privacy';

/** A LUKU token: five groups of four digits. As good as money until it is used. */
const TOKEN = /\b\d{4}(?:[ -]\d{4}){4}\b/g;

/** A number after a word that says it is an account, card or meter number. */
const ACCOUNT =
  /\b(a\/c|acc|account|akaunti|card|kadi|meter|mita)([^\d\n]{0,16})(\d[\d -]{4,}\d)/gi;

/** A Tanzanian mobile number: 07…/06…, 2557…/2556… or +255…, standing alone. */
const MOBILE = /(^|[^\d+])((?:\+?255|0)[67]\d{8})(?!\d)/g;

export function maskForAi(text: string): string {
  return text
    .replace(TOKEN, (token) => `**** **** **** **** ${token.replace(/\D/g, '').slice(-4)}`)
    .replace(
      ACCOUNT,
      (_all, word: string, gap: string, digits: string) => `${word}${gap}${maskNumber(digits)}`,
    )
    .replace(MOBILE, (_all, lead: string, number: string) => `${lead}${maskNumber(number)}`);
}
