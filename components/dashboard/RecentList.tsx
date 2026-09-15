import { Pressable, View } from 'react-native';

import type { Transaction } from '../../features/transactions';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import { isIncoming, isOutgoing, TYPE_LABELS } from '../../types/domain';
import { formatAmount, formatSignedAmount } from '../../utils/format';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

const ICON_CIRCLE = 40;
const MARK = 22;

type Mark = 'confirmed' | 'saved' | 'waiting' | 'ignored';

const markOf = (t: Transaction): Mark =>
  t.status === 'CONFIRMED'
    ? 'confirmed'
    : t.status === 'NEEDS_REVIEW'
      ? 'waiting'
      : t.status === 'IGNORED'
        ? 'ignored'
        : 'saved';

const SPOKEN_MARK: Record<Mark, string> = {
  confirmed: 'confirmed by you',
  saved: 'saved',
  waiting: 'needs review',
  ignored: 'ignored',
};

/**
 * The latest records on a dark card, each with a mark on the right: a lime
 * tick once confirmed, a plain tick when saved, an open circle while it waits
 * for review.
 */
export function RecentList({
  transactions,
  total,
  onOpen,
  onOpenAll,
}: {
  transactions: readonly Transaction[];
  /** Every record, for "All N". */
  total: number;
  onOpen: (id: string) => void;
  onOpenAll: () => void;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.neutralRamp[900],
        borderRadius: radius.lg,
        padding: space[4],
        paddingBottom: space[3],
        gap: space[2],
        marginBottom: space[3],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <Text
          variant="h3"
          accessibilityRole="header"
          style={{ flex: 1, fontFamily: fonts.heading, color: colors.surface }}
        >
          Recent transactions
        </Text>
        <Pressable
          onPress={onOpenAll}
          accessibilityRole="button"
          accessibilityLabel={`All ${total} records`}
          style={{ minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: space[2] }}
        >
          <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.accentRamp[300] }}>
            All {total} →
          </Text>
        </Pressable>
      </View>

      {transactions.map((t) => (
        <RecentRow key={t.id} transaction={t} onPress={() => onOpen(t.id)} />
      ))}
    </View>
  );
}

function RecentRow({ transaction: t, onPress }: { transaction: Transaction; onPress: () => void }) {
  const incoming = isIncoming(t.type);
  const outgoing = isOutgoing(t.type);
  const name = t.counterparty ?? 'No name';
  // Neither in nor out (a balance update, say) carries no sign at all.
  const amount =
    t.amount == null
      ? '—'
      : incoming || outgoing
        ? formatSignedAmount(t.amount, incoming)
        : formatAmount(t.amount);
  const when = t.transactionTime ?? t.transactionDate;
  const detail = when ? `${TYPE_LABELS[t.type]} · ${when}` : TYPE_LABELS[t.type];
  const mark = markOf(t);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${TYPE_LABELS[t.type]}, ${amount} ${incoming ? 'from' : 'to'} ${name}, ${SPOKEN_MARK[mark]}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        minHeight: MIN_TOUCH + 8,
        paddingVertical: space[1],
        paddingHorizontal: space[1],
        marginHorizontal: -space[1],
        borderRadius: radius.md,
        backgroundColor: pressed ? colors.neutralRamp[800] : 'transparent',
      })}
    >
      <View
        style={{
          width: ICON_CIRCLE,
          height: ICON_CIRCLE,
          borderRadius: radius.pill,
          backgroundColor: colors.neutralRamp[800],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name={incoming ? 'arrowIn' : outgoing ? 'arrowOut' : 'records'}
          size={18}
          color={
            incoming
              ? colors.accent2Ramp[300]
              : outgoing
                ? colors.accentRamp[300]
                : colors.neutralRamp[400]
          }
        />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.surface }}
        >
          {name}
        </Text>
        <Text variant="small" numberOfLines={1} style={{ color: colors.neutralRamp[400] }}>
          {detail}
        </Text>
      </View>

      <Text
        variant="bodyMedium"
        style={{
          fontFamily: fonts.heading,
          fontSize: 14,
          color: incoming ? colors.accent2Ramp[300] : colors.surface,
        }}
      >
        {amount}
      </Text>

      <MarkBadge mark={mark} />
    </Pressable>
  );
}

function MarkBadge({ mark }: { mark: Mark }) {
  if (mark === 'waiting') {
    return (
      <View
        style={{
          width: MARK,
          height: MARK,
          borderRadius: radius.pill,
          borderWidth: 2,
          borderColor: colors.neutralRamp[600],
        }}
      />
    );
  }
  const filled = mark === 'confirmed';
  return (
    <View
      style={{
        width: MARK,
        height: MARK,
        borderRadius: radius.pill,
        backgroundColor: filled ? colors.accent2Ramp[400] : colors.neutralRamp[800],
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon
        name={mark === 'ignored' ? 'close' : 'check'}
        size={12}
        strokeWidth={3.4}
        color={filled ? colors.neutralRamp[900] : colors.neutralRamp[400]}
      />
    </View>
  );
}
