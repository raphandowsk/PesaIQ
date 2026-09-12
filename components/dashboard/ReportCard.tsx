import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import type { MonthlyReport } from '../../features/reports';
import { colors, fonts, radius, shadow, space } from '../../theme';
import { formatTzs, MINUS } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const signedTzs = (n: number) =>
  n > 0 ? `+${formatTzs(n)}` : n < 0 ? `${MINUS}${formatTzs(-n)}` : formatTzs(0);

/** This month's summary in three figures, opening the full report and its PDF. */
export function ReportCard({ report }: { report: MonthlyReport }) {
  const t = report.totals;
  const figures = [
    { label: 'In', value: formatTzs(t.received) },
    { label: 'Out', value: formatTzs(Math.round((t.spent + t.charges) * 100) / 100) },
    { label: 'Net', value: signedTzs(t.net) },
  ];

  return (
    <Pressable
      onPress={() => router.push('/reports')}
      accessibilityRole="button"
      accessibilityLabel={`Monthly report, ${report.period.label}. ${figures
        .map((f) => `${f.label} ${f.value}`)
        .join(', ')}. Opens the full summary.`}
      style={({ pressed }) => [
        {
          backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
          borderRadius: radius.lg,
          padding: space[4],
          marginBottom: space[6],
          gap: space[3],
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="kicker" tone="muted">
            Monthly report
          </Text>
          <Text variant="bodyMedium" style={{ fontFamily: fonts.heading, fontSize: 17 }}>
            {report.period.label}
          </Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.neutralRamp[700]} />
      </View>

      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {figures.map((f) => (
          <View key={f.label} style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="small" tone="muted">
              {f.label}
            </Text>
            <Text
              variant="small"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.text }}
            >
              {f.value}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}
