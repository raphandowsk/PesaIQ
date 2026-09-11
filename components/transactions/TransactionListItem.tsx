import { Pressable, View } from 'react-native';

import type { Transaction } from '../../features/transactions';
import { colors, fonts, money, radius, shadow, space } from '../../theme';
import { isIncoming, isOutgoing, TYPE_LABELS } from '../../types/domain';
import { formatAmount, formatSignedAmount } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const TILE = 38;
const TILE_RADIUS = 14;

/**
 * The design's compact record row: direction tile, counterparty, type and
 * time, amount and confidence. Used for recent records on Home; the Records
 * list reuses it in 1G.
 */
export function TransactionListItem({
  transaction: t,
  onPress,
}: {
  transaction: Transaction;
  onPress?: () => void;
}) {
  const incoming = isIncoming(t.type);
  const outgoing = isOutgoing(t.type);
  const tone =
    t.amount == null || (!incoming && !outgoing) ? money.none : incoming ? money.in : money.out;

  const name = t.counterparty ?? 'No name';
  // Neither in nor out (a balance update, say) carries no sign at all.
  const amount =
    t.amount == null
      ? '—'
      : incoming || outgoing
        ? formatSignedAmount(t.amount, incoming)
        : formatAmount(t.amount);
  const when = t.transactionTime ?? t.transactionDate;
  const meta = when ? `${TYPE_LABELS[t.type]} · ${when}` : TYPE_LABELS[t.type];
  const review = t.status === 'NEEDS_REVIEW' ? ', needs review' : '';
  const label = `${TYPE_LABELS[t.type]}, ${amount} ${incoming ? 'from' : 'to'} ${name}${review}`;

  const row = (pressed: boolean) => (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
          borderRadius: radius.md,
          padding: space[3],
        },
        shadow.sm,
      ]}
    >
      <View
        style={{
          width: TILE,
          height: TILE,
          borderRadius: TILE_RADIUS,
          backgroundColor: tone.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={incoming ? 'arrowIn' : outgoing ? 'arrowOut' : 'records'}
          size={19}
          color={tone.ink}
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          style={{ fontFamily: fonts.semibold, fontSize: 14 }}
        >
          {name}
        </Text>
        <Text variant="small" tone="muted" numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text
          variant="bodyMedium"
          style={{
            fontFamily: fonts.heading,
            fontSize: 15,
            color: incoming ? colors.accent2Ramp[700] : colors.text,
          }}
        >
          {amount}
        </Text>
        <Text variant="small" tone="muted" style={{ fontSize: 11 }}>
          {Math.round(t.confidence * 100)}%
        </Text>
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label}>
        {row(false)}
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => row(pressed)}
    </Pressable>
  );
}
