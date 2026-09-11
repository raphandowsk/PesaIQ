import { View } from 'react-native';

import type { ProviderSummaryRow } from '../../features/insights';
import { colors, fonts, radius, space } from '../../theme';
import { formatAmount, formatTzs, initials } from '../../utils/format';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';

const AVATAR = 32;
const TINTS = [
  { tint: colors.accent2Ramp[200], ink: colors.accent2Ramp[800] },
  { tint: colors.accentRamp[200], ink: colors.accentRamp[800] },
  { tint: colors.neutralRamp[300], ink: colors.neutralRamp[800] },
];

const records = (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`;

/**
 * Money moved per provider. Required by the brief; the design computes it but
 * never places it, so this is PesaIQ's addition, styled from the design's rows.
 */
export function ProviderSummary({ rows }: { rows: ProviderSummaryRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginBottom: space[4] }}>
      <Text variant="kicker" tone="muted" style={{ marginBottom: space[1] }}>
        By provider
      </Text>
      {rows.map((row, i) => {
        const tone = TINTS[i % TINTS.length];
        return (
          <View
            key={row.name}
            accessible
            accessibilityLabel={`${row.name}: ${records(row.count)}, ${formatTzs(row.amount)} moved`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[3],
              paddingVertical: space[2],
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.divider,
            }}
          >
            <View
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: radius.pill,
                backgroundColor: tone.tint,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="small" style={{ fontFamily: fonts.heading, color: tone.ink }}>
                {initials(row.name)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                variant="bodyMedium"
                numberOfLines={1}
                style={{ fontFamily: fonts.semibold, fontSize: 14 }}
              >
                {row.name}
              </Text>
              <Text variant="small" tone="muted">
                {records(row.count)}
              </Text>
            </View>
            <Text variant="bodyMedium" style={{ fontFamily: fonts.heading }}>
              {formatAmount(row.amount)}
            </Text>
          </View>
        );
      })}
    </Card>
  );
}
