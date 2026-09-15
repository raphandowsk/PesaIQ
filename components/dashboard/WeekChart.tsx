import { Animated, View } from 'react-native';

import type { WeekDay, WeekSpending } from '../../features/insights';
import { colors, fonts, radius, space, textFaint } from '../../theme';
import { formatCompact, formatTzs } from '../../utils/format';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { useProgress } from './animation';
import { CornerButton } from './CornerButton';

const BAR_AREA = 96;
const BAR_WIDTH = 8;
const MIN_BAR = 6;
const DOT = 5;
/** Room above the tallest bar for today's figure. */
const BUBBLE_ROOM = 26;

/**
 * This week's spending as one bar a day, Monday to Sunday, today in the
 * accent with its figure above it. Days still to come show an empty track.
 */
export function WeekChart({
  week,
  animate,
  replay,
  onOpen,
}: {
  week: WeekSpending;
  animate: boolean;
  replay: number;
  onOpen: () => void;
}) {
  const progress = useProgress({
    animate,
    replay: `${replay}:${week.total}`,
    duration: 750,
    delay: 160,
  });

  const spoken = `This week you spent ${formatTzs(week.total)}. ${week.days
    .filter((d) => !d.isFuture)
    .map((d) => `${d.name} ${formatTzs(d.amount)}`)
    .join(', ')}.`;

  return (
    <Card style={{ marginBottom: space[3], gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text
          variant="h3"
          accessibilityRole="header"
          style={{ flex: 1, fontFamily: fonts.heading }}
        >
          This week
        </Text>
        <CornerButton label="Open Records" onPress={onOpen} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <Text variant="amount">{formatTzs(week.total)}</Text>
        <Text variant="small" tone="muted" style={{ lineHeight: 16 }}>
          {'Spent\nsince Monday'}
        </Text>
      </View>

      <View
        accessible
        accessibilityLabel={spoken}
        style={{ flexDirection: 'row', justifyContent: 'space-between' }}
      >
        {week.days.map((day) => (
          <DayBar key={day.name} day={day} max={week.max} progress={progress} />
        ))}
      </View>
    </Card>
  );
}

function DayBar({ day, max, progress }: { day: WeekDay; max: number; progress: Animated.Value }) {
  const barHeight =
    day.amount > 0 && max > 0 ? Math.max(MIN_BAR, (day.amount / max) * BAR_AREA) : 0;
  const height = progress.interpolate({ inputRange: [0, 1], outputRange: [0, barHeight] });
  const fill = day.isToday ? colors.accent : colors.neutralRamp[900];

  return (
    <View style={{ alignItems: 'center', width: 40 }}>
      <View style={{ height: BAR_AREA + BUBBLE_ROOM, justifyContent: 'flex-end' }}>
        {day.isToday && day.amount > 0 ? (
          <View
            style={{
              position: 'absolute',
              bottom: barHeight + 6,
              alignSelf: 'center',
              backgroundColor: colors.accentRamp[200],
              borderRadius: radius.pill,
              paddingHorizontal: space[2],
              paddingVertical: 2,
            }}
          >
            <Text
              variant="small"
              numberOfLines={1}
              style={{ fontFamily: fonts.heading, fontSize: 11, color: colors.accentRamp[900] }}
            >
              {formatCompact(day.amount)}
            </Text>
          </View>
        ) : null}
        <View
          style={{
            height: BAR_AREA,
            width: BAR_WIDTH,
            borderRadius: radius.pill,
            backgroundColor: colors.neutralRamp[200],
            justifyContent: 'flex-end',
            overflow: 'hidden',
          }}
        >
          <Animated.View
            style={{ height, width: BAR_WIDTH, borderRadius: radius.pill, backgroundColor: fill }}
          />
        </View>
      </View>
      <View
        style={{
          width: DOT,
          height: DOT,
          borderRadius: radius.pill,
          marginTop: space[2],
          backgroundColor: day.amount > 0 ? fill : colors.neutralRamp[300],
        }}
      />
      <Text
        variant="small"
        style={{
          marginTop: space[1],
          fontSize: 12,
          fontFamily: day.isToday ? fonts.heading : fonts.semibold,
          color: day.isToday
            ? colors.accentRamp[700]
            : day.isFuture
              ? textFaint
              : colors.neutralRamp[800],
        }}
      >
        {day.short}
      </Text>
    </View>
  );
}
