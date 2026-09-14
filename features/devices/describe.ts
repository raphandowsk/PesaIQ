import type { ThisPhone } from './store';

/** What the platform says about the phone. */
export interface PhoneFacts {
  os: string;
  /** Android: the maker, e.g. "samsung". */
  brand?: string;
  /** Android: the model, e.g. "SM-A515F". */
  model?: string;
  /** iOS: 'phone' or 'pad'. */
  idiom?: string;
}

/** The server keeps labels to 60 characters. */
const MAX_LABEL = 60;

const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A name a person recognises, from what the platform reports. Nothing else is sent. */
export function describePhone(facts: PhoneFacts): ThisPhone {
  if (facts.os === 'android') {
    const brand = facts.brand ? capitalised(facts.brand) : '';
    const model = facts.model ?? '';
    // Some models already start with the maker ("Google Pixel 7").
    const label =
      brand && !model.toLowerCase().startsWith(brand.toLowerCase())
        ? `${brand} ${model}`.trim()
        : model || brand;
    return { label: (label || 'Android phone').slice(0, MAX_LABEL), platform: 'android' };
  }
  if (facts.os === 'ios') {
    return { label: facts.idiom === 'pad' ? 'iPad' : 'iPhone', platform: 'ios' };
  }
  return { label: 'Web browser', platform: 'web' };
}
