import { View, type ViewProps } from 'react-native';

import { colors, radius, space } from '../../theme';
import { Text } from './Text';

type Tone = 'accent' | 'positive' | 'neutral' | 'outline';

const TONES: Record<Tone, { bg: string; ink: string; border?: string }> = {
  accent: { bg: colors.accentRamp[100], ink: colors.accentRamp[800] },
  positive: { bg: colors.accent2Ramp[100], ink: colors.accent2Ramp[800] },
  neutral: { bg: colors.neutralRamp[200], ink: colors.neutralRamp[700] },
  outline: { bg: 'transparent', ink: colors.accentRamp[700], border: colors.accentRamp[500] },
};

export interface TagProps extends ViewProps {
  label: string;
  tone?: Tone;
}

/** Small status pill — provider maturity, DEMO markers, review flags. */
export function Tag({ label, tone = 'neutral', style, ...rest }: TagProps) {
  const t = TONES[tone];
  return (
    <View
      style={[
        {
          alignSelf: 'flex-start',
          backgroundColor: t.bg,
          borderRadius: radius.pill,
          paddingHorizontal: space[3],
          paddingVertical: space[1],
          borderWidth: t.border ? 1 : 0,
          borderColor: t.border,
        },
        style,
      ]}
      {...rest}
    >
      <Text variant="kicker" style={{ color: t.ink }}>
        {label}
      </Text>
    </View>
  );
}
