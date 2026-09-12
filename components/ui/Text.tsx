import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { colors, textFaint, textMuted, type } from '../../theme';

type Variant = keyof typeof type;
type Tone = 'default' | 'muted' | 'faint' | 'accent' | 'positive' | 'inverse';

const TONES: Record<Tone, string> = {
  default: colors.text,
  muted: textMuted,
  faint: textFaint,
  accent: colors.accentRamp[700],
  // 700 is 4.3:1 on the page ground; 800 clears AA everywhere.
  positive: colors.accent2Ramp[800],
  inverse: colors.surface,
};

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
}

// The system font size is honoured everywhere. Only the fixed-size chrome is
// capped, where larger text would be clipped by its container.
const MAX_SCALE: Partial<Record<Variant, number>> = { tabLabel: 1.4, badge: 1.2 };

/**
 * Typed text primitive. Every screen uses this rather than bare <Text> so the
 * type scale and tones stay in one place.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  style,
  maxFontSizeMultiplier,
  ...rest
}: TextProps) {
  return (
    <RNText
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? MAX_SCALE[variant]}
      style={[type[variant] as TextStyle, { color: TONES[tone] }, style]}
      {...rest}
    />
  );
}
