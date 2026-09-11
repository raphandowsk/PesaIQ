import {
  BAND_THRESHOLDS,
  bandFor,
  CONFIDENCE_BASE,
  CONFIDENCE_MAX,
  CONFIDENCE_MIN,
  FACTOR_WEIGHTS,
  isLowConfidenceField,
  LOW_FIELD_THRESHOLD,
  NON_TRANSACTIONAL_CAP,
  scoreConfidence,
  type ConfidenceInput,
} from '../features/parser/confidence';

const NOTHING_FOUND: ConfidenceInput = {
  hasProvider: false,
  hasKnownType: false,
  hasAmountWithCurrency: false,
  hasReference: false,
  hasCounterparty: false,
  hasDate: false,
  hasBalance: false,
  category: 'OTHER',
  classifierConfidence: 0.4,
};

const EVERYTHING_FOUND: ConfidenceInput = {
  hasProvider: true,
  hasKnownType: true,
  hasAmountWithCurrency: true,
  hasReference: true,
  hasCounterparty: true,
  hasDate: true,
  hasBalance: true,
  category: 'PAYMENT_RECEIVED',
  classifierConfidence: 0.95,
};

describe('confidence constants are the shipped formula', () => {
  // These are the numbers the app uses to tell a user something is verified.
  // They are asserted so a change has to be deliberate.
  it('carries the exact factor weights', () => {
    expect(FACTOR_WEIGHTS).toEqual({
      provider: 0.16,
      type: 0.16,
      amount: 0.2,
      reference: 0.14,
      counterparty: 0.12,
      date: 0.1,
      balance: 0.08,
    });
  });

  it('weights sum to 0.96, leaving the base to carry the rest', () => {
    const total = Object.values(FACTOR_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(0.96, 10);
    expect(CONFIDENCE_BASE).toBe(0.24);
  });

  it('carries the exact band thresholds', () => {
    expect(BAND_THRESHOLDS).toEqual({ veryHigh: 0.95, high: 0.8, medium: 0.6 });
  });

  it('caps non-transactional messages at 0.52', () => {
    expect(NON_TRANSACTIONAL_CAP).toBe(0.52);
  });
});

describe('scoreConfidence', () => {
  it('stays within bounds when nothing was extracted', () => {
    const r = scoreConfidence(NOTHING_FOUND);
    expect(r.confidence).toBeGreaterThanOrEqual(CONFIDENCE_MIN);
    expect(r.confidence).toBeLessThanOrEqual(CONFIDENCE_MAX);
    expect(r.band).toBe('Needs review');
  });

  it('scores a complete parse very high', () => {
    const r = scoreConfidence(EVERYTHING_FOUND);
    // (0.24 + 0.96) * (0.72 + 0.95*0.3) = 1.2 * 1.005 = 1.206 -> clamped
    expect(r.confidence).toBe(CONFIDENCE_MAX);
    expect(r.band).toBe('Very high');
  });

  it('computes the documented formula exactly', () => {
    const r = scoreConfidence({
      ...NOTHING_FOUND,
      hasKnownType: true,
      hasAmountWithCurrency: true,
      category: 'PAYMENT_RECEIVED',
      classifierConfidence: 0.92,
    });
    // base 0.24 + type 0.16 + amount 0.20 = 0.60; damped by (0.72 + 0.276)
    expect(r.confidence).toBeCloseTo(0.6 * 0.996, 10);
  });

  it('raises confidence as more fields are found', () => {
    const base: ConfidenceInput = {
      ...NOTHING_FOUND,
      hasKnownType: true,
      category: 'PAYMENT_SENT',
      classifierConfidence: 0.91,
    };
    const few = scoreConfidence(base);
    const many = scoreConfidence({
      ...base,
      hasAmountWithCurrency: true,
      hasReference: true,
      hasProvider: true,
    });
    expect(many.confidence).toBeGreaterThan(few.confidence);
  });

  it('never lets a promotional message look confident', () => {
    // Realistic promotional confidence: base 0.72 plus the TZS boost.
    const r = scoreConfidence({
      ...EVERYTHING_FOUND,
      category: 'PROMOTIONAL',
      classifierConfidence: 0.75,
    });
    expect(r.confidence).toBeLessThanOrEqual(NON_TRANSACTIONAL_CAP);
    expect(r.band).toBe('Needs review');
  });

  it('never lets an OTP look confident', () => {
    const r = scoreConfidence({
      ...EVERYTHING_FOUND,
      category: 'OTP',
      classifierConfidence: 0.93,
    });
    expect(r.confidence).toBeLessThanOrEqual(NON_TRANSACTIONAL_CAP);
  });

  it('holds the cap even at a classifier confidence that would lift it', () => {
    // Guards the ordering fix: capping before damping lets the multiplier
    // (up to 1.02) push the value back above the ceiling.
    for (const category of ['PROMOTIONAL', 'OTP'] as const) {
      const r = scoreConfidence({
        ...EVERYTHING_FOUND,
        category,
        classifierConfidence: 1,
      });
      expect(r.confidence).toBeLessThanOrEqual(NON_TRANSACTIONAL_CAP);
      expect(r.band).toBe('Needs review');
    }
  });

  it('reports every factor with its weight and whether it landed', () => {
    const r = scoreConfidence(EVERYTHING_FOUND);
    expect(r.factors).toHaveLength(7);
    expect(r.factors.every((f) => f.hit)).toBe(true);

    const missing = scoreConfidence(NOTHING_FOUND);
    expect(missing.factors.every((f) => !f.hit)).toBe(true);
  });
});

describe('bandFor', () => {
  it.each([
    [0.99, 'Very high'],
    [0.95, 'Very high'],
    [0.94, 'High'],
    [0.8, 'High'],
    [0.79, 'Medium'],
    [0.6, 'Medium'],
    [0.59, 'Needs review'],
    [0, 'Needs review'],
  ])('maps %s to %s', (confidence, expected) => {
    expect(bandFor(confidence)).toBe(expected);
  });
});

describe('isLowConfidenceField', () => {
  it('flags a field found weakly', () => {
    expect(isLowConfidenceField(0.62)).toBe(true);
    expect(isLowConfidenceField(LOW_FIELD_THRESHOLD - 0.01)).toBe(true);
  });

  it('does not flag a strong field', () => {
    expect(isLowConfidenceField(LOW_FIELD_THRESHOLD)).toBe(false);
    expect(isLowConfidenceField(0.97)).toBe(false);
  });

  it('does not flag a missing field as merely low', () => {
    // Missing and doubtful are different states and the UI shows them apart.
    expect(isLowConfidenceField(0)).toBe(false);
  });
});
