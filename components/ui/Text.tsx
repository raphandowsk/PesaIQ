import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, textFaint, textMuted, type } from '../../theme';

type Variant = keyof typeof type;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'positive' | 'inverse';

const TONES: Record<Tone, string> = {
  default: colors.text,
  muted: textMuted,
  faint: textFaint,
  accent: colors.accentRamp[700],
  positive: colors.accent2Ramp[700],
  inverse: colors.surface,
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

/**
 * Typed text primitive. Every screen uses this rather than bare <Text> so the
 * type scale and tones stay in one place.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  return <RNText style={[type[variant] as TextStyle, { color: TONES[tone] }, style]} {...rest} />;
}
