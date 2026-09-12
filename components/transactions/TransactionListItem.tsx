import { Pressable, View } from 'react-native';

import type { Transaction } from '../../features/transactions';
import { colors, fonts, money, radius, shadow, space } from '../../theme';
import { isIncoming, isOutgoing, TYPE_LABELS } from '../../types/domain';
import { formatAmount, formatSignedAmount } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export type TransactionListItemVariant = 'recent' | 'record';

// Geometry from the design. Home's recent rows are compact; the Records list's
// rows are a little larger.
const GEOMETRY = {
  recent: { tile: 38, corner: radius.md, amountSize: 15 },
  record: { tile: 40, corner: radius.lg, amountSize: 16 },
} as const;
const TILE_RADIUS = 14;

/**
 * One record as a row: direction tile, counterparty, a detail line, amount and
 * confidence.
 *
 * `recent` (Home) reads "Received · 14:22". `record` (Records) reads
 * "Received · 07** *** 678" and flags a record that needs review or was
 * ignored, as the design's list does.
 */
export function TransactionListItem({
  transaction: t,
  onPress,
  variant = 'recent',
}: {
  transaction: Transaction;
  onPress?: () => void;
  variant?: TransactionListItemVariant;
}) {
  const g = GEOMETRY[variant];
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
  const detail =
    variant === 'record'
      ? `${TYPE_LABELS[t.type]} · ${t.maskedAccountOrPhone ?? 'no number'}`
      : when
        ? `${TYPE_LABELS[t.type]} · ${when}`
        : TYPE_LABELS[t.type];

  const flag =
    variant !== 'record'
      ? null
      : t.status === 'NEEDS_REVIEW'
        ? { label: 'Needs review', tint: colors.accentRamp[200], ink: colors.accentRamp[800] }
        : t.status === 'IGNORED'
          ? { label: 'Ignored', tint: colors.neutralRamp[200], ink: colors.neutralRamp[700] }
          : null;

  const spokenStatus =
    t.status === 'NEEDS_REVIEW' ? ', needs review' : t.status === 'IGNORED' ? ', ignored' : '';
  const label = `${TYPE_LABELS[t.type]}, ${amount} ${incoming ? 'from' : 'to'} ${name}${spokenStatus}`;

  const row = (pressed: boolean) => (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
          borderRadius: g.corner,
          padding: space[3],
        },
        shadow.sm,
      ]}
    >
      <View
        style={{
          width: g.tile,
          height: g.tile,
          borderRadius: TILE_RADIUS,
          backgroundColor: tone.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={incoming ? 'arrowIn' : outgoing ? 'arrowOut' : 'records'}
          size={variant === 'record' ? 20 : 19}
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
          {detail}
        </Text>
        {flag ? (
          <View
            style={{
              alignSelf: 'flex-start',
              marginTop: space[1],
              backgroundColor: flag.tint,
              borderRadius: radius.pill,
              paddingHorizontal: space[2],
              paddingVertical: 2,
            }}
          >
            <Text variant="kicker" style={{ fontSize: 10, color: flag.ink }}>
              {flag.label}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text
          variant="bodyMedium"
          style={{
            fontFamily: fonts.heading,
            fontSize: g.amountSize,
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
