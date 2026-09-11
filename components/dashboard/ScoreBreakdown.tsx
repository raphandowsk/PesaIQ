import { Animated, View } from 'react-native';

import type { Health } from '../../features/insights';
import { colors, fonts, radius, space } from '../../theme';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { useProgress } from './animation';

const BAR_HEIGHT = 9;
/** A part at zero keeps a sliver of bar, so it reads as empty rather than absent. */
const MIN_BAR_PCT = 3;

/** "What builds the score": each weighted part, as a bar. */
export function ScoreBreakdown({
  health,
  animate,
  replay,
}: {
  health: Health;
  animate: boolean;
  replay: number;
}) {
  const progress = useProgress({
    animate,
    replay: `${replay}:${health.score}`,
    duration: 750,
    delay: 160,
  });

  return (
    <Card style={{ gap: space[3], marginBottom: space[3] }}>
      <Text variant="kicker" tone="muted">
        What builds the score
      </Text>

      {health.parts.map((part) => {
        const pct = Math.round(part.value * 100);
        const weight = Math.round(part.weight * 100);
        const width = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0%', `${Math.max(MIN_BAR_PCT, pct)}%`],
        });

        return (
          <View
            key={part.key}
            style={{ gap: space[1] }}
            accessible
            accessibilityLabel={`${part.label}: ${pct}%, weight ${weight}%`}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: space[2],
              }}
            >
              <Text variant="small" style={{ flexShrink: 1, fontFamily: fonts.semibold }}>
                {part.label}
              </Text>
              <Text variant="small" tone="muted">
                {pct}% · weight {weight}%
              </Text>
            </View>
            <View
              style={{
                height: BAR_HEIGHT,
                borderRadius: radius.pill,
                backgroundColor: colors.neutralRamp[300],
                overflow: 'hidden',
              }}
            >
              <Animated.View
                style={{
                  height: '100%',
                  width,
                  borderRadius: radius.pill,
                  backgroundColor:
                    part.value >= 0.6 ? colors.accent2Ramp[500] : colors.accentRamp[400],
                }}
              />
            </View>
          </View>
        );
      })}
    </Card>
  );
}
