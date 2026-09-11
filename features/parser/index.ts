export { normalize, normalizeText, normalizationNote } from './normalizer';
export type { NormalizedSms, NormalizeOptions } from './normalizer';

export { classify } from './classifier';
export type { ClassificationResult } from './classifier';

export {
  extractAmount,
  extractBalance,
  extractReference,
  extractCounterparty,
  extractMaskedIdentifier,
  extractDate,
} from './extractors';
export type { Extracted, ExtractedDate } from './extractors';

export {
  scoreConfidence,
  bandFor,
  buildFactors,
  isLowConfidenceField,
  FACTOR_WEIGHTS,
  BAND_THRESHOLDS,
  LOW_FIELD_THRESHOLD,
  NON_TRANSACTIONAL_CAP,
  CONFIDENCE_BASE,
  CONFIDENCE_MIN,
  CONFIDENCE_MAX,
} from './confidence';
export type {
  ConfidenceBand,
  ConfidenceFactor,
  ConfidenceInput,
  ConfidenceResult,
} from './confidence';

export { detectProvider, PROVIDERS } from './providers';
export type { SmsProvider, ProviderMatch } from './providers';

export { SAMPLES, getSample } from './samples';
export type { SmsSample } from './samples';

export {
  parseMessage,
  parseNormalized,
  formatAmount,
  MAX_MESSAGE_LENGTH,
  EmptyMessageError,
  MessageTooLongError,
} from './engine';

export { parseResultSchema, parsedFieldSchema, validateParseResult } from './schema';
export type { ParseResult, ParsedField, ParseValidation } from './schema';
