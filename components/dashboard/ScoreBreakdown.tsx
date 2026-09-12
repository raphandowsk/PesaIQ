import { Animated, View } from 'react-native';

import type { Health } from '../../features/insights';
import { explainHealth } from '../../features/insights/healthExplain';
import { colors, fonts, radius, space } from '../../theme';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { useProgress } from './animation';

const BAR_HEIGHT = 9;
/** A part at zero keeps a sliver of bar, so it reads as empty rather than absent. */
const MIN_BAR_PCT = 3;

/**
 * "What builds the score": each part's points out of its maximum, what it
 * measured in the user's own figures, then what the score means on the scale
 * and where the most points are still to be won.
 */
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
  const explained = explainHealth(health);

  return (
    <Card style={{ gap: space[3], marginBottom: space[3] }}>
      <View style={{ gap: space[1] }}>
        <Text variant="kicker" tone="muted" accessibilityRole="header">
          What builds the score
        </Text>
        <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 17 }}>
          Your {health.score} is these four parts added up. Each is scored from your saved records,
          and counts for up to the points shown.
        </Text>
      </View>

      {explained.parts.map((part) => {
        const width = progress.interpolate({
          inputRange: [0, 1],
          outputRange: ['0%', `${Math.max(MIN_BAR_PCT, Math.round(part.value * 100))}%`],
        });

        return (
          <View
            key={part.key}
            style={{ gap: space[1] }}
            accessible
            accessibilityLabel={`${part.label}: ${part.points} of ${part.maxPoints} points. ${part.detail}`}
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
              <Text variant="small" style={{ fontFamily: fonts.bold }}>
                {part.points}
                <Text variant="small" tone="muted">
                  {' '}
                  / {part.maxPoints} pts
                </Text>
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
            <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 17 }}>
              {part.detail}
            </Text>
          </View>
        );
      })}

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          paddingTop: space[3],
          gap: space[2],
        }}
      >
        <Text variant="small" accessibilityRole="header" style={{ fontFamily: fonts.bold }}>
          What {health.score} means
        </Text>
        <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 17 }}>
          {explained.meaning}
        </Text>

        <View
          accessible
          accessibilityLabel={`Scale: ${explained.scale.map((s) => `${s.band} ${s.min} to ${s.max}`).join(', ')}. Yours is ${health.band}.`}
          style={{ flexDirection: 'row', gap: 4 }}
        >
          {explained.scale.map((step) => {
            const on = step.band === health.band;
            return (
              <View
                key={step.band}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: space[1],
                  borderRadius: radius.sm,
                  backgroundColor: on ? colors.accent2Ramp[300] : colors.neutralRamp[200],
                }}
              >
                <Text
                  variant="small"
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 11,
                    color: on ? colors.accent2Ramp[900] : colors.neutralRamp[700],
                  }}
                >
                  {step.band}
                </Text>
                <Text
                  variant="small"
                  style={{
                    fontSize: 11,
                    color: on ? colors.accent2Ramp[900] : colors.neutralRamp[700],
                  }}
                >
                  {step.min}–{step.max}
                </Text>
              </View>
            );
          })}
        </View>

        {explained.biggestGain ? (
          <Text variant="small" style={{ fontSize: 12, lineHeight: 17 }}>
            <Text variant="small" style={{ fontSize: 12, fontFamily: fonts.bold }}>
              Most room to grow: {explained.biggestGain.label}
            </Text>
            , {explained.biggestGain.points} more points possible. {explained.biggestGain.raise}
          </Text>
        ) : null}

        <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 17 }}>
          A guide built from the records saved on this phone. It is not a credit score.
        </Text>
      </View>
    </Card>
  );
}
