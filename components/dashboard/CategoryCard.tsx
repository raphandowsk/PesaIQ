import { Animated, Pressable, View } from 'react-native';

import type { CategoryBreakdown, CategoryMode } from '../../features/insights';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import { formatAmount, formatTzs } from '../../utils/format';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';
import { useProgress } from './animation';

/** The design's bar palette, cycled down the list. */
const BAR_COLORS = [
  colors.accentRamp[500],
  colors.accentRamp[400],
  colors.accent2Ramp[500],
  colors.accent2Ramp[400],
  colors.accentRamp[300],
  colors.neutralRamp[500],
];

const MODES: readonly { key: CategoryMode; label: string }[] = [
  { key: 'spend', label: 'Spending' },
  { key: 'earn', label: 'Income' },
];

const BAR_HEIGHT = 11;
const PCT_PILL = 44;
const MIN_BAR_PCT = 3;

export interface CategoryCardProps {
  spend: CategoryBreakdown;
  earn: CategoryBreakdown;
  mode: CategoryMode;
  onModeChange: (mode: CategoryMode) => void;
  animate: boolean;
  replay: number;
}

/** Spending or income by category, with the design's two-way toggle. */
export function CategoryCard({
  spend,
  earn,
  mode,
  onModeChange,
  animate,
  replay,
}: CategoryCardProps) {
  const data = mode === 'spend' ? spend : earn;
  // Switching mode regrows the bars from nothing, as in the design.
  const progress = useProgress({
    animate,
    replay: `${replay}:${mode}:${data.total}`,
    duration: 800,
    delay: 60,
  });

  return (
    <Card style={{ gap: space[4], marginBottom: space[6] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="kicker" tone="muted">
            {mode === 'spend' ? 'Total spending' : 'Total income'}
          </Text>
          <Text variant="amount">{formatTzs(data.total)}</Text>
        </View>

        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: 'row',
            gap: 3,
            backgroundColor: colors.neutralRamp[200],
            borderRadius: radius.pill,
            padding: 2,
          }}
        >
          {MODES.map((m) => {
            const on = m.key === mode;
            return (
              <Pressable
                key={m.key}
                onPress={() => onModeChange(m.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={m.label}
                style={{
                  minHeight: MIN_TOUCH,
                  paddingHorizontal: space[3],
                  borderRadius: radius.pill,
                  justifyContent: 'center',
                  backgroundColor: on ? colors.accentRamp[200] : 'transparent',
                }}
              >
                <Text
                  variant="small"
                  style={{
                    fontFamily: fonts.bold,
                    color: on ? colors.accentRamp[900] : colors.neutralRamp[800],
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {data.rows.length === 0 ? (
        <Text variant="small" tone="muted">
          {mode === 'spend'
            ? 'No spending recorded yet. Save a payment, bill or withdrawal to see it here.'
            : 'No income recorded yet. Save a payment you received to see it here.'}
        </Text>
      ) : (
        <View style={{ gap: space[3] }}>
          {data.rows.map((row, i) => {
            const width = progress.interpolate({
              inputRange: [0, 1],
              outputRange: ['0%', `${Math.max(MIN_BAR_PCT, row.pct)}%`],
            });
            return (
              <View
                key={row.name}
                style={{ gap: space[1] }}
                accessible
                accessibilityLabel={`${row.name}: ${formatTzs(row.amount)}, ${row.pct}%`}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <Text
                    variant="bodyMedium"
                    numberOfLines={1}
                    style={{ flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14 }}
                  >
                    {row.name}
                  </Text>
                  <Text variant="bodyMedium" style={{ fontFamily: fonts.heading }}>
                    {formatAmount(row.amount)}
                  </Text>
                  <View
                    style={{
                      width: PCT_PILL,
                      alignItems: 'center',
                      backgroundColor: colors.accentRamp[200],
                      borderRadius: radius.pill,
                      paddingVertical: 2,
                    }}
                  >
                    <Text
                      variant="small"
                      style={{
                        fontFamily: fonts.heading,
                        fontSize: 11,
                        color: colors.accentRamp[900],
                      }}
                    >
                      {row.pct}%
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    height: BAR_HEIGHT,
                    borderRadius: radius.pill,
                    backgroundColor: colors.neutralRamp[200],
                    overflow: 'hidden',
                  }}
                >
                  <Animated.View
                    style={{
                      height: '100%',
                      width,
                      borderRadius: radius.pill,
                      backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    }}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
