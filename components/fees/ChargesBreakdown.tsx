import { View } from 'react-native';

import { OPERATOR_FEES_LABEL, type ChargeSplit } from '../../features/insights';
import { colors, fonts, space } from '../../theme';
import { formatTzs } from '../../utils/format';
import { Text } from '../ui/Text';

/**
 * Fees & taxes as a sum: operator fees + taxes = fees & taxes. Several taxes
 * (a LUKU receipt's VAT, EWURA and REA) are listed under Taxes; a single one
 * is named beside it.
 */
export function ChargesBreakdown({ split }: { split: ChargeSplit }) {
  const only = split.taxLines.length === 1 ? split.taxLines[0] : null;

  return (
    <View>
      <Line label={OPERATOR_FEES_LABEL} value={formatTzs(split.operatorFees)} />
      <Line label={only ? `+ Taxes (${only.label})` : '+ Taxes'} value={formatTzs(split.taxes)} />
      {split.taxLines.length > 1
        ? split.taxLines.map((line) => (
            <Line key={line.key} label={line.label} value={formatTzs(line.amount)} indent />
          ))
        : null}
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.divider,
          marginTop: space[1],
          paddingTop: space[1],
        }}
      >
        <Line label="= Fees & taxes" value={formatTzs(split.total)} strong />
      </View>
    </View>
  );
}

function Line({
  label,
  value,
  strong = false,
  indent = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  /** One tax among several, set in under Taxes. */
  indent?: boolean;
}) {
  const size = indent ? { fontSize: 12 } : null;
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: space[3],
        paddingVertical: indent ? 2 : 4,
        paddingLeft: indent ? space[4] : 0,
      }}
    >
      <Text
        variant="small"
        style={[
          {
            flex: 1,
            fontFamily: strong ? fonts.bold : fonts.semibold,
            color: strong ? colors.text : colors.neutralRamp[700],
          },
          size,
        ]}
      >
        {label}
      </Text>
      <Text
        variant="small"
        style={[
          {
            fontFamily: strong ? fonts.heading : fonts.bold,
            color: indent ? colors.neutralRamp[700] : colors.text,
          },
          size,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}
