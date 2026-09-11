import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { Transaction } from '../../features/transactions';
import { colors, money, radius, space } from '../../theme';
import { isIncoming, TYPE_LABELS } from '../../types/domain';
import { formatSignedAmount, initials } from '../../utils/format';
import { Card } from '../ui/Card';
import { Tag } from '../ui/Tag';
import { Text } from '../ui/Text';

export interface TransactionRowProps {
  transaction: Transaction;
  onPress?: () => void;
  /** Buttons rendered under the row — the review queue's Confirm / Ignore. */
  actions?: ReactNode;
}

const AVATAR = 40;

/**
 * One record, as a card. Used by Home, Records and Review so a transaction
 * looks the same wherever it appears.
 *
 * Identifiers are shown as stored — already masked — and never reassembled.
 */
export function TransactionRow({ transaction: t, onPress, actions }: TransactionRowProps) {
  const incoming = isIncoming(t.type);
  const tone = t.amount == null ? money.none : incoming ? money.in : money.out;
  const name = t.counterparty ?? 'No name';
  const amount = formatSignedAmount(t.amount, incoming);

  const content = (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
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
          <Text variant="smallMedium" style={{ color: tone.ink }}>
            {initials(t.counterparty)}
          </Text>
        </View>

        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {TYPE_LABELS[t.type]} · {t.maskedAccountOrPhone ?? 'no number'}
          </Text>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text variant="bodyMedium" style={{ color: tone.amount }}>
            {amount}
          </Text>
          <Text variant="small" tone="faint">
            {Math.round(t.confidence * 100)}%
          </Text>
        </View>
      </View>

      {t.status === 'NEEDS_REVIEW' ||
      t.status === 'CONFIRMED' ||
      t.status === 'IGNORED' ||
      t.isDemo ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {t.status === 'NEEDS_REVIEW' ? <Tag label="Needs review" tone="accent" /> : null}
          {t.status === 'CONFIRMED' ? <Tag label="Confirmed" tone="positive" /> : null}
          {t.status === 'IGNORED' ? <Tag label="Ignored" tone="neutral" /> : null}
          {t.isDemo ? <Tag label="Demo" tone="neutral" /> : null}
        </View>
      ) : null}

      {actions ? <View style={{ flexDirection: 'row', gap: space[2] }}>{actions}</View> : null}
    </View>
  );

  const label = `${TYPE_LABELS[t.type]}, ${amount} ${incoming ? 'from' : 'to'} ${name}, ${t.status
    .replace('_', ' ')
    .toLowerCase()}`;

  if (!onPress) {
    return (
      <Card accessible={!actions} accessibilityLabel={actions ? undefined : label}>
        {content}
      </Card>
    );
  }

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      {({ pressed }) => (
        <Card style={pressed ? { backgroundColor: colors.neutralRamp[200] } : undefined}>
          {content}
        </Card>
      )}
    </Pressable>
  );
}
