import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Health } from '../../features/insights';
import { colors, fonts, money, radius, shadow, space } from '../../theme';
import { formatAmount, formatCompact, formatTzs, MINUS } from '../../utils/format';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';

const ICON_CIRCLE = 34;
/** Characters a note line holds on a phone-width tile. */
const NOTE_FIT = 21;

/** "Fee 6,846 + Tax 1,054", or "Fee 12K + Tax 2.1K" when the full figures would not fit one line. */
function splitNote({ operatorFees, taxes }: { operatorFees: number; taxes: number }): string {
  const exact = `Fee ${formatAmount(operatorFees)} + Tax ${formatAmount(taxes)}`;
  return exact.length <= NOTE_FIT
    ? exact
    : `Fee ${formatCompact(operatorFees)} + Tax ${formatCompact(taxes)}`;
}

export interface StatTileProps {
  label: string;
  value: string;
  icon: IconName;
  /** The icon circle's fill and the icon's ink. */
  tint: string;
  ink: string;
  valueInk?: string;
  /** A smaller line under the figure. */
  note?: string;
  /** What a screen reader says for the whole tile. */
  spoken?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** One figure with its round icon and label, as Home's tiles and the welcome preview show it. */
export function StatTile({
  label,
  value,
  icon,
  tint,
  ink,
  valueInk = colors.text,
  note,
  spoken,
  onPress,
  style,
}: StatTileProps) {
  const body = (pressed: boolean) => (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
          borderRadius: radius.md,
          padding: space[3],
          gap: space[2],
        },
        shadow.sm,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View
          style={{
            width: ICON_CIRCLE,
            height: ICON_CIRCLE,
            borderRadius: radius.pill,
            backgroundColor: tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={17} color={ink} />
        </View>
        <Text
          variant="smallMedium"
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: fonts.semibold,
            color: colors.neutralRamp[800],
          }}
        >
          {label}
        </Text>
      </View>
      <View>
        <Text
          variant="amount"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ fontSize: 21, lineHeight: 26, color: valueInk }}
        >
          {value}
        </Text>
        {note ? (
          <Text
            variant="small"
            numberOfLines={1}
            style={{ fontSize: 11, lineHeight: 15, color: colors.neutralRamp[700] }}
          >
            {note}
          </Text>
        ) : null}
      </View>
    </View>
  );

  const label_ = spoken ?? `${label} ${value}`;
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={label_}
        style={[{ flexBasis: '46%', flexGrow: 1 }, style]}
      >
        {body(false)}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label_}
      style={[{ flexBasis: '46%', flexGrow: 1 }, style]}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
}

/**
 * Received, spent, fees & taxes and net as four tiles, two by two. Net is after
 * fees and taxes. Fees & taxes opens its own screen.
 */
export function StatTiles({
  health,
  chargeSplit,
  onOpenFees,
}: {
  health: Health;
  chargeSplit: { operatorFees: number; taxes: number };
  onOpenFees: () => void;
}) {
  const positive = health.net >= 0;
  const net = `${positive ? '+' : MINUS}${formatAmount(Math.abs(health.net))}`;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3] }}>
      <StatTile
        label="Received"
        value={formatAmount(health.received)}
        icon="arrowIn"
        tint={money.in.tint}
        ink={money.in.ink}
        spoken={`Received ${formatTzs(health.received)}`}
      />
      <StatTile
        label="Spent"
        value={formatAmount(health.spent)}
        icon="arrowOut"
        tint={money.out.tint}
        ink={money.out.ink}
        spoken={`Spent ${formatTzs(health.spent)}`}
      />
      <StatTile
        label="Fees & taxes"
        value={formatAmount(health.charges)}
        icon="receipt"
        tint={colors.accentRamp[100]}
        ink={colors.accentRamp[800]}
        note={splitNote(chargeSplit)}
        spoken={`Fees and taxes ${formatTzs(health.charges)}: operator fees ${formatTzs(chargeSplit.operatorFees)} plus taxes ${formatTzs(chargeSplit.taxes)}. Opens Fees and taxes.`}
        onPress={onOpenFees}
      />
      <StatTile
        label="Net"
        value={net}
        icon="wallet"
        tint={colors.neutralRamp[200]}
        ink={colors.neutralRamp[800]}
        valueInk={positive ? colors.accent2Ramp[800] : colors.accentRamp[700]}
        spoken={`Net ${net}, after fees and taxes`}
      />
    </View>
  );
}
