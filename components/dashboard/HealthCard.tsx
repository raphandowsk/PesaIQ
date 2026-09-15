import { Easing, View } from 'react-native';

import type { Health } from '../../features/insights';
import { BAND_MEANINGS } from '../../features/insights/healthExplain';
import { colors, fonts, radius, space } from '../../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useCountUp, useProgress } from './animation';
import { CornerButton } from './CornerButton';
import { ScoreRing } from './ScoreRing';

const RING = 128;
const STROKE = 12;
const BLOB = 180;
/** The design counts up in ~24 steps of 36ms. */
const COUNT_MS = 860;

export interface HealthCardProps {
  health: Health;
  streak: number;
  animate: boolean;
  replay: number;
  /** Opens what builds the score, from the corner button. */
  onExplain?: () => void;
}

/**
 * The lime health card: the score ring, its band and what that means, and the
 * streak. The figures it is built from sit in the tiles below it.
 */
export function HealthCard({ health, streak, animate, replay, onExplain }: HealthCardProps) {
  const progress = useProgress({
    animate,
    // A new score replays the count, as well as returning to the tab.
    replay: `${replay}:${health.score}`,
    duration: COUNT_MS,
    easing: Easing.linear,
  });
  const shown = useCountUp(health.score, progress, animate);

  const ringInk = health.score >= 60 ? colors.accent2Ramp[600] : colors.accentRamp[500];
  const spokenStreak = streak > 0 ? ` ${streak}-day streak.` : '';
  const spokenScore = `Financial health ${health.score} out of 100, ${health.band}. ${BAND_MEANINGS[health.band]}${spokenStreak}`;

  return (
    <View
      style={{
        backgroundColor: colors.accent2Ramp[200],
        borderRadius: radius.lg,
        padding: space[4],
        marginBottom: space[3],
        gap: space[3],
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          width: BLOB,
          height: BLOB,
          borderRadius: BLOB / 2,
          backgroundColor: colors.accent2Ramp[300],
          opacity: 0.55,
          bottom: -90,
          right: -60,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text
          variant="h3"
          accessibilityRole="header"
          style={{ flex: 1, fontFamily: fonts.heading, color: colors.accent2Ramp[900] }}
        >
          Financial health
        </Text>
        {onExplain ? (
          <CornerButton label="What builds your score" tone="lime" onPress={onExplain} />
        ) : null}
      </View>

      <View
        accessible
        accessibilityLabel={spokenScore}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[4] }}
      >
        <ScoreRing
          size={RING}
          stroke={STROKE}
          value={shown}
          ink={ringInk}
          trackInk={colors.accent2Ramp[400]}
        >
          <Text variant="display" style={{ color: colors.accent2Ramp[900] }}>
            {shown}
          </Text>
          <Text variant="kicker" style={{ fontSize: 9, color: colors.accent2Ramp[800] }}>
            out of 100
          </Text>
        </ScoreRing>

        <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
          <Text variant="h2" style={{ color: colors.accent2Ramp[900] }}>
            {health.band}
          </Text>
          <Text variant="small" style={{ color: colors.accent2Ramp[900], lineHeight: 17 }}>
            {BAND_MEANINGS[health.band]}
          </Text>
          {streak > 0 ? (
            <View
              style={{
                flexDirection: 'row',
                alignSelf: 'flex-start',
                alignItems: 'center',
                gap: space[1],
                marginTop: space[2],
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: space[3],
                paddingVertical: space[1],
              }}
            >
              <Icon name="flame" size={14} color={colors.accentRamp[700]} />
              <Text variant="small" style={{ fontFamily: fonts.bold, fontSize: 11 }}>
                {streak}-day streak
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
