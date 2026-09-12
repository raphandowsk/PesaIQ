/**
 * PesaIQ color tokens.
 *
 * Ported verbatim from the design canvas
 * `Android app design questions/PesaIQ Android.dc.html` (2026-09-11 revision).
 * The canvas inlines its tokens; the older `_ds/organic-*` folder is an archive
 * of the superseded theme and is NOT the source of truth.
 *
 * Ramps are 100 (lightest) → 900 (darkest) on a shared perceptual lightness
 * scale, so the same step of any ramp carries the same visual weight.
 */

/** Violet — the primary accent. Outgoing money is tinted from this ramp. */
export const accent = {
  100: '#f8f1ff',
  200: '#eddffd',
  300: '#ddc4fa',
  400: '#c49af3',
  500: '#a76fe8',
  600: '#8a4fd8',
  700: '#6d33b8',
  800: '#4f2288',
  900: '#33165a',
} as const;

/** Lime — the second accent. Incoming money is tinted from this ramp. */
export const accent2 = {
  100: '#f2fbe7',
  200: '#e3f7ce',
  300: '#cbeeab',
  400: '#a9de7d',
  500: '#86cd52',
  600: '#6aad39',
  700: '#4c8226',
  800: '#375f1c',
  900: '#233d12',
} as const;

export const neutral = {
  100: '#ffffff',
  200: '#f3f2f8',
  300: '#e6e4ef',
  400: '#cfccdd',
  500: '#a8a4bb',
  600: '#817d95',
  700: '#605c72',
  800: '#403d4e',
  900: '#201e2b',
} as const;

export const colors = {
  /** Page ground. */
  bg: '#f7f6fc',
  /** Cards and raised surfaces. */
  surface: '#ffffff',
  text: '#16151c',
  /** Base accent — equals accent[600]. */
  accent: '#8a4fd8',
  /** Base second accent — equals accent2[600]. */
  accent2: '#6aad39',
  divider: 'rgba(32,30,43,0.09)',

  accentRamp: accent,
  accent2Ramp: accent2,
  neutralRamp: neutral,
} as const;

/**
 * Muted body text, made by mixing text into the ground as the design does.
 * The design's 0.58 measured 4.1–4.45:1, just under WCAG AA (4.5:1) for small
 * text, so it is raised to clear AA on every ground the app uses
 * (tests/contrast.test.ts).
 */
export const textMuted = 'rgba(22,21,28,0.66)';
/** Fainter still: metadata, timestamps. Raised from 0.45 (2.9:1) for AA. */
export const textFaint = 'rgba(22,21,28,0.62)';

/**
 * Money direction tints. Incoming reads lime, outgoing reads violet —
 * matching `tint()` / `ink()` in the design script.
 */
export const money = {
  in: { tint: accent2[200], ink: accent2[800], amount: accent2[700] },
  out: { tint: accent[200], ink: accent[800], amount: colors.text },
  none: { tint: neutral[200], ink: neutral[800], amount: neutral[700] },
} as const;

export type ColorRamp = typeof accent;
