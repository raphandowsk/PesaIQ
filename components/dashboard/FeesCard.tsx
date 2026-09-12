import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { OPERATOR_FEES_LABEL, type FeesSummary } from '../../features/insights';
import { colors, fonts, radius, shadow, space } from '../../theme';
import { formatTzs } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** This month's fees and taxes, as operator fees + taxes, opening the full breakdown. */
export function FeesCard({ summary }: { summary: FeesSummary }) {
  const count = summary.records.length;
  const { split } = summary;
  const spoken =
    count === 0
      ? 'None recorded this month.'
      : `${formatTzs(summary.total)} this month, across ${count} ${count === 1 ? 'transaction' : 'transactions'}: operator fees ${formatTzs(split.operatorFees)} plus taxes ${formatTzs(split.taxes)}.`;

  return (
    <Pressable
      onPress={() => router.push('/fees')}
      accessibilityRole="button"
      accessibilityLabel={`Fees and taxes. ${spoken} Opens the breakdown.`}
      style={({ pressed }) => [
        {
          backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
          borderRadius: radius.lg,
          padding: space[4],
          marginBottom: space[6],
          gap: space[2],
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="kicker" tone="muted">
            Fees & taxes this month
          </Text>
          <Text variant="amount">{formatTzs(summary.total)}</Text>
        </View>
        <Icon name="chevronRight" size={18} color={colors.neutralRamp[700]} />
      </View>

      {count === 0 ? (
        <Text variant="small" tone="muted">
          None recorded this month. Tap to see earlier months.
        </Text>
      ) : (
        <>
          <Text variant="small" tone="muted">
            Across {count} {count === 1 ? 'transaction' : 'transactions'}
          </Text>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space[2] }}
          >
            <Part text={`${OPERATOR_FEES_LABEL} ${formatTzs(split.operatorFees)}`} />
            <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.accentRamp[900] }}>
              +
            </Text>
            <Part text={`Taxes ${formatTzs(split.taxes)}`} />
          </View>
        </>
      )}
    </Pressable>
  );
}

function Part({ text }: { text: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.accentRamp[100],
        borderRadius: radius.pill,
        paddingHorizontal: space[3],
        paddingVertical: space[1],
      }}
    >
      <Text
        variant="small"
        style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.accentRamp[900] }}
      >
        {text}
      </Text>
    </View>
  );
}
