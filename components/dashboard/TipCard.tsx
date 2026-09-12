import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { Tip } from '../../features/insights';
import { colors, fonts, radius, space } from '../../theme';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';

const TONES: Record<
  'spend' | 'earn',
  { bg: string; iconBg: string; iconInk: string; ink: string; whyInk: string; icon: IconName }
> = {
  spend: {
    bg: colors.accentRamp[200],
    iconBg: colors.accentRamp[400],
    iconInk: colors.accentRamp[900],
    ink: colors.accentRamp[900],
    whyInk: colors.accentRamp[800],
    icon: 'arrowOut',
  },
  earn: {
    bg: colors.accent2Ramp[200],
    iconBg: colors.accent2Ramp[700],
    iconInk: colors.surface,
    ink: colors.accent2Ramp[900],
    whyInk: colors.accent2Ramp[800],
    icon: 'arrowIn',
  },
};

const ICON_CIRCLE = 36;

/** One tip: violet for spending, lime for income, with the figure behind it. */
export function TipCard({
  tip,
  tone,
  style,
}: {
  tip: Tip;
  tone: 'spend' | 'earn';
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];

  return (
    <View
      accessible
      accessibilityLabel={`${tip.title}. ${tip.body} ${tip.why}.`}
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: space[3],
          backgroundColor: t.bg,
          borderRadius: radius.lg,
          padding: space[4],
        },
        style,
      ]}
    >
      <View
        style={{
          width: ICON_CIRCLE,
          height: ICON_CIRCLE,
          borderRadius: radius.pill,
          backgroundColor: t.iconBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={t.icon} size={19} color={t.iconInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
        <Text
          variant="bodyMedium"
          style={{ fontFamily: fonts.heading, fontSize: 16, lineHeight: 20, color: t.ink }}
        >
          {tip.title}
        </Text>
        <Text variant="small" style={{ color: t.ink }}>
          {tip.body}
        </Text>
        <Text
          variant="small"
          style={{ fontFamily: fonts.bold, fontSize: 11, color: t.whyInk, marginTop: 2 }}
        >
          {tip.why}
        </Text>
      </View>
    </View>
  );
}
