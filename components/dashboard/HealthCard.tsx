import { Easing, Pressable, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { Health } from '../../features/insights';
import { BAND_MEANINGS } from '../../features/insights/healthExplain';
import { colors, fonts, radius, space } from '../../theme';
import { formatAmount, formatTzs, MINUS } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { useCountUp, useProgress } from './animation';

// Geometry from the design's health ring.
const RING = 116;
const STROKE = 10;
const RADIUS = 47;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const BLOB = 180;
/** The design counts up in ~24 steps of 36ms. */
const COUNT_MS = 860;

export interface HealthCardProps {
  health: Health;
  streak: number;
  animate: boolean;
  replay: number;
  /** Opens what builds the score. The score and its info tag are the target. */
  onExplain?: () => void;
}

const INFO_TAG = 20;

/**
 * The lime health card: score ring, band and what it means, streak, and
 * received / spent / fees & taxes / net. Net is after fees and taxes.
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
  // Follows the count-up rather than animating an SVG prop: on web, Animated
  // forwards `collapsable` onto the DOM <circle>.
  const dashOffset = CIRCUMFERENCE * (1 - shown / 100);

  const positive = health.net >= 0;
  const net = `${positive ? '+' : MINUS}${formatAmount(Math.abs(health.net))}`;
  const spokenStreak = streak > 0 ? ` ${streak}-day streak.` : '';
  const spokenScore = `Financial health ${health.score} out of 100, ${health.band}. ${BAND_MEANINGS[health.band]}${spokenStreak}`;
  const spokenTotals = `Received ${formatTzs(health.received)}. Spent ${formatTzs(health.spent)}. Fees and taxes ${formatTzs(health.charges)}. Net ${net}.`;

  return (
    <View
      style={{
        backgroundColor: colors.accent2Ramp[200],
        borderRadius: radius.lg,
        padding: space[4],
        marginBottom: space[3],
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
          top: -70,
          right: -60,
        }}
      />

      <Pressable
        onPress={onExplain}
        disabled={!onExplain}
        accessible
        accessibilityRole={onExplain ? 'button' : undefined}
        accessibilityLabel={
          onExplain ? `${spokenScore} Opens what builds your score.` : spokenScore
        }
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[4],
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <View style={{ width: RING, height: RING }}>
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
                stroke={ringInk}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={dashOffset}
              />
            </Svg>
          </View>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="display" style={{ color: colors.accent2Ramp[900] }}>
              {shown}
            </Text>
            <Text variant="kicker" style={{ fontSize: 9, color: colors.accent2Ramp[800] }}>
              out of 100
            </Text>
          </View>
        </View>

        <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
            <Text variant="kicker" style={{ color: colors.accent2Ramp[800] }}>
              Financial health
            </Text>
            {onExplain ? (
              <View
                style={{
                  width: INFO_TAG,
                  height: INFO_TAG,
                  borderRadius: INFO_TAG / 2,
                  backgroundColor: colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon
                  name="info"
                  size={INFO_TAG}
                  color={colors.accent2Ramp[900]}
                  strokeWidth={2.25}
                />
              </View>
            ) : null}
          </View>
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
      </Pressable>

      {/* Received − spent − fees & taxes = net: two rows so all four fit a phone. */}
      <View
        accessible
        accessibilityLabel={spokenTotals}
        style={{ gap: space[2], marginTop: space[4] }}
      >
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <MiniStat
            label="Received"
            value={formatAmount(health.received)}
            labelInk={colors.accent2Ramp[800]}
          />
          <MiniStat
            label="Spent"
            value={formatAmount(health.spent)}
            labelInk={colors.accentRamp[700]}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <MiniStat
            label="Fees & taxes"
            value={formatAmount(health.charges)}
            labelInk={colors.accentRamp[700]}
          />
          <MiniStat
            label="Net"
            value={net}
            labelInk={colors.neutralRamp[700]}
            valueInk={positive ? colors.accent2Ramp[800] : colors.accentRamp[700]}
          />
        </View>
      </View>
    </View>
  );
}

function MiniStat({
  label,
  value,
  labelInk,
  valueInk = colors.text,
}: {
  label: string;
  value: string;
  labelInk: string;
  valueInk?: string;
}) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        padding: space[2],
      }}
    >
      <Text variant="kicker" style={{ fontSize: 10, color: labelInk }}>
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{ fontFamily: fonts.heading, fontSize: 14, color: valueInk, marginTop: 2 }}
      >
        {value}
      </Text>
    </View>
  );
}
