import { Pressable } from 'react-native';

import { colors, HIT_SLOP, radius } from '../../theme';
import { Icon } from '../ui/Icon';

const SIZE = 40;

type Tone = 'light' | 'lime' | 'dark';

const TONES: Record<Tone, { bg: string; ink: string }> = {
  light: { bg: colors.neutralRamp[200], ink: colors.neutralRamp[900] },
  lime: { bg: colors.accent2Ramp[300], ink: colors.accent2Ramp[900] },
  dark: { bg: colors.neutralRamp[800], ink: colors.surface },
};

/** The round ↗ in a Home card's corner: opens more about that card. */
export function CornerButton({
  label,
  onPress,
  tone = 'light',
}: {
  /** What it opens, for screen readers: "Open Records". */
  label: string;
  onPress: () => void;
  tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderRadius: radius.pill,
        backgroundColor: t.bg,
        opacity: pressed ? 0.75 : 1,
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name="arrowOut" size={16} color={t.ink} />
    </Pressable>
  );
}
