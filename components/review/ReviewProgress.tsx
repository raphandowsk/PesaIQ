import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, radius, space } from '../../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

// Geometry from the design's progress ring.
const RING = 40;
const RADIUS = 16;
const STROKE = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const STREAK_CARD = 128;
const FLAME_CIRCLE = 34;

/** "Cleared this week" ring beside the day streak. */
export function ReviewProgress({
  cleared,
  target,
  streak,
}: {
  cleared: number;
  target: number;
  streak: number;
}) {
  const fraction = Math.min(cleared, target) / target;

  return (
    <View style={{ flexDirection: 'row', gap: space[2], marginBottom: space[4] }}>
      <View
        accessible
        accessibilityLabel={`${cleared} of ${target} cleared this week`}
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          backgroundColor: colors.accent2Ramp[200],
          borderRadius: radius.lg,
          padding: space[3],
        }}
      >
        <View style={{ transform: [{ rotate: '-90deg' }] }}>
          <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              fill="none"
              stroke={colors.accent2Ramp[400]}
              strokeWidth={STROKE}
            />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              fill="none"
              stroke={colors.accent2Ramp[700]}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            />
          </Svg>
        </View>
        <View>
          <Text
            variant="bodyMedium"
            style={{ fontFamily: fonts.heading, fontSize: 17, color: colors.accent2Ramp[900] }}
          >
            {cleared}/{target}
          </Text>
          <Text variant="small" style={{ fontSize: 11, color: colors.accent2Ramp[800] }}>
            Cleared this week
          </Text>
        </View>
      </View>

      <View
        accessible
        accessibilityLabel={`${streak}-day streak`}
        style={{
          width: STREAK_CARD,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          backgroundColor: colors.accentRamp[200],
          borderRadius: radius.lg,
          padding: space[3],
        }}
      >
        <View
          style={{
            width: FLAME_CIRCLE,
            height: FLAME_CIRCLE,
            borderRadius: radius.pill,
            backgroundColor: colors.accentRamp[400],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="flame" size={18} color={colors.accentRamp[900]} />
        </View>
        <View>
          <Text
            variant="bodyMedium"
            style={{ fontFamily: fonts.heading, fontSize: 17, color: colors.accentRamp[900] }}
          >
            {streak}
          </Text>
          <Text variant="small" style={{ fontSize: 11, color: colors.accentRamp[800] }}>
            day streak
          </Text>
        </View>
      </View>
    </View>
  );
}
