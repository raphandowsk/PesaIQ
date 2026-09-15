import { Pressable, View } from 'react-native';

import { topCategories, type CategoryBreakdown, type CategoryMode } from '../../features/insights';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import { formatAmount, formatTzs } from '../../utils/format';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';

/** One colour per segment, largest first; the last is "Everything else". */
const SEGMENT_COLORS = [
  colors.accentRamp[500],
  colors.neutralRamp[900],
  colors.accent2Ramp[500],
  colors.neutralRamp[400],
];

const SEGMENT_HEIGHT = 40;
const SEGMENT_GAP = 4;
/** The narrowest a segment gets, as a share, so its percentage still fits above it. */
const MIN_SHARE = 9;
const DOT = 10;
const PCT_PILL = 44;

const MODES: readonly { key: CategoryMode; label: string }[] = [
  { key: 'spend', label: 'Spending' },
  { key: 'earn', label: 'Income' },
];

/**
 * Spending or income by category as one segmented bar, each segment's share
 * above it, with the amounts listed underneath. The three largest categories
 * keep their names; the rest are folded into "Everything else".
 */
export function SplitCard({
  spend,
  earn,
  mode,
  onModeChange,
}: {
  spend: CategoryBreakdown;
  earn: CategoryBreakdown;
  mode: CategoryMode;
  onModeChange: (mode: CategoryMode) => void;
}) {
  const data = mode === 'spend' ? spend : earn;
  const rows = topCategories(data);

  return (
    <Card style={{ gap: space[4], marginBottom: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text
          variant="h3"
          accessibilityRole="header"
          style={{ flex: 1, minWidth: 0, fontFamily: fonts.heading }}
        >
          By category
        </Text>

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
                  backgroundColor: on ? colors.neutralRamp[900] : 'transparent',
                }}
              >
                <Text
                  variant="small"
                  style={{
                    fontFamily: fonts.bold,
                    color: on ? colors.surface : colors.neutralRamp[800],
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Its own line: beside the toggle, a six-figure total wraps on a phone. */}
      <View style={{ marginTop: -space[2] }}>
        <Text variant="kicker" tone="muted">
          {mode === 'spend' ? 'Total spending' : 'Total income'}
        </Text>
        <Text variant="amount">{formatTzs(data.total)}</Text>
      </View>

      {rows.length === 0 ? (
        <Text variant="small" tone="muted">
          {mode === 'spend'
            ? 'No spending recorded yet. Save a payment, bill or withdrawal to see it here.'
            : 'No income recorded yet. Save a payment you received to see it here.'}
        </Text>
      ) : (
        <>
          {/* The bar repeats the list below, so screen readers read the list. */}
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ flexDirection: 'row', gap: SEGMENT_GAP }}
          >
            {rows.map((row, i) => (
              <View
                key={row.name}
                style={{ flexGrow: Math.max(row.pct, MIN_SHARE), flexBasis: 0, minWidth: 0 }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    gap: space[1],
                    height: 22,
                    marginBottom: space[1],
                  }}
                >
                  <View
                    style={{ width: 1, height: 22, backgroundColor: colors.neutralRamp[400] }}
                  />
                  <Text
                    variant="small"
                    numberOfLines={1}
                    style={{ fontFamily: fonts.bold, fontSize: 12, lineHeight: 14 }}
                  >
                    {row.pct}%
                  </Text>
                </View>
                <View
                  style={{
                    height: SEGMENT_HEIGHT,
                    borderRadius: radius.sm,
                    backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  }}
                />
              </View>
            ))}
          </View>

          <View style={{ gap: space[2] }}>
            {rows.map((row, i) => (
              <View
                key={row.name}
                accessible
                accessibilityLabel={`${row.name}: ${formatTzs(row.amount)}, ${row.pct}%`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
              >
                <View
                  style={{
                    width: DOT,
                    height: DOT,
                    borderRadius: radius.pill,
                    backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                  }}
                />
                <Text
                  variant="bodyMedium"
                  numberOfLines={1}
                  style={{ flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14 }}
                >
                  {row.name}
                </Text>
                <Text variant="bodyMedium" style={{ fontFamily: fonts.heading, fontSize: 14 }}>
                  {formatAmount(row.amount)}
                </Text>
                <View
                  style={{
                    width: PCT_PILL,
                    alignItems: 'center',
                    backgroundColor: colors.neutralRamp[200],
                    borderRadius: radius.pill,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    variant="small"
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 11,
                      color: colors.neutralRamp[800],
                    }}
                  >
                    {row.pct}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Card>
  );
}
