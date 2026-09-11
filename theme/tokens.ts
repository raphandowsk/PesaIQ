/**
 * Spacing, radius, typography and elevation tokens.
 * Ported from the 2026-09-11 design canvas — see `theme/colors.ts` for provenance.
 */
import { Platform } from 'react-native';

/** The canvas's --space-* scale (clean integers since the 2026-09-11 revision). */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 18,
  6: 26,
  8: 36,
} as const;

/** The canvas's --radius-* scale. Pills use `radius.pill`. */
export const radius = {
  sm: 12,
  md: 20,
  lg: 30,
  pill: 999,
} as const;

/**
 * Plus Jakarta Sans is the only family. Headings are weight 800; body is
 * regular. Keys match the `@expo-google-fonts/plus-jakarta-sans` export names
 * loaded in `app/_layout.tsx`.
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  /** Headings. The design sets --font-heading-weight: 800. */
  heading: 'PlusJakartaSans_800ExtraBold',
  /** Pasted and normalized message text. System monospace, nothing to load. */
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
} as const;

/** Type scale. `font` names a key of `fonts`; sizes follow the canvas. */
export const type = {
  display: { fontFamily: fonts.heading, fontSize: 34, lineHeight: 38 },
  /** Onboarding and screen titles — the design sets these at 30px. */
  title: { fontFamily: fonts.heading, fontSize: 30, lineHeight: 33 },
  h1: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 32 },
  h2: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 27 },
  h3: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 23 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyMedium: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  smallMedium: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18 },
  /** All-caps section kickers — the design letterspaces these. */
  kicker: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.9,
    textTransform: 'uppercase' as const,
  },
  /** Monetary figures — tabular so columns align. */
  amount: { fontFamily: fonts.heading, fontSize: 24, lineHeight: 29 },
  /** Labels on the large call-to-action buttons. */
  button: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 20 },
  /** Bottom-tab labels. */
  tabLabel: { fontFamily: fonts.bold, fontSize: 10, lineHeight: 13 },
  /** Counts inside the small tab badge. */
  badge: { fontFamily: fonts.heading, fontSize: 9, lineHeight: 11 },
  /** Raw and normalized SMS text. */
  mono: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
} as const;

/**
 * Violet-tinted elevation. RN cannot express the canvas's CSS shadows exactly:
 * Android uses `elevation`, iOS uses the shadow* props.
 */
export const shadow = {
  sm: Platform.select({
    android: { elevation: 1 },
    default: {
      shadowColor: '#4a406e',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 2 },
    },
  }),
  md: Platform.select({
    android: { elevation: 3 },
    default: {
      shadowColor: '#4a406e',
      shadowOpacity: 0.11,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 10 },
    },
  }),
  lg: Platform.select({
    android: { elevation: 8 },
    default: {
      shadowColor: '#4a406e',
      shadowOpacity: 0.18,
      shadowRadius: 52,
      shadowOffset: { width: 0, height: 20 },
    },
  }),
} as const;

/** Minimum touch target (Android accessibility guidance). */
export const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const MIN_TOUCH = 48;
