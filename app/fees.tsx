import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { TransactionListItem } from '../components/transactions/TransactionListItem';
import { BackButton } from '../components/ui/BackButton';
import { Card, Screen, Text } from '../components/ui';
import { FEE_PERIODS, feesSummary, type ChargeRow, type FeePeriod } from '../features/insights';
import { chargesOf, useAppStore } from '../features/transactions';
import { colors, fonts, MIN_TOUCH, radius, space } from '../theme';
import { formatTzs } from '../utils/format';

const BAR_HEIGHT = 8;
const MIN_BAR_PCT = 3;

const leave = () => (router.canGoBack() ? router.back() : router.replace('/dashboard'));

/**
 * Fees and taxes paid: the total for a period, split by type (the provider's
 * own fees, agent fees, VAT, EWURA, REA, levies) and by provider, and the
 * records they came from. Each figure is what the messages themselves state.
 */
export default function FeesAndTaxes() {
  const transactions = useAppStore((s) => s.transactions);
  const [period, setPeriod] = useState<FeePeriod>('month');
  // Periods are measured from when the screen opened.
  const [now] = useState(() => new Date());

  const summary = useMemo(
    () => feesSummary(transactions, period, now),
    [transactions, period, now],
  );
  const count = summary.records.length;

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingTop: space[3],
          marginBottom: space[4],
        }}
      >
        <BackButton onPress={leave} />
        <Text variant="h2" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
          Fees & taxes
        </Text>
      </View>

      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', gap: space[2], marginBottom: space[4] }}
      >
        {FEE_PERIODS.map((p) => {
          const on = p.key === period;
          return (
            <Pressable
              key={p.key}
              onPress={() => setPeriod(p.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={p.label}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: MIN_TOUCH,
                borderRadius: radius.pill,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: on ? colors.accentRamp[300] : colors.neutralRamp[300],
                backgroundColor: on
                  ? colors.accentRamp[200]
                  : pressed
                    ? colors.neutralRamp[200]
                    : colors.surface,
              })}
            >
              <Text
                variant="small"
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 13,
                  color: on ? colors.accentRamp[900] : colors.neutralRamp[800],
                }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ marginBottom: space[3], gap: space[1] }}>
        <Text variant="kicker" tone="muted">
          Paid in fees and taxes
        </Text>
        <Text variant="amount">{formatTzs(summary.total)}</Text>
        <Text variant="small" tone="muted">
          {count === 0
            ? 'No fees or taxes in this period.'
            : `Across ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
        </Text>
      </Card>

      {count > 0 ? (
        <>
          <Breakdown title="By type" rows={summary.byType} total={summary.total} />
          <Breakdown title="By provider" rows={summary.byProvider} total={summary.total} />

          <Text
            variant="kicker"
            tone="muted"
            accessibilityRole="header"
            style={{ marginTop: space[2], marginBottom: space[2] }}
          >
            Transactions
          </Text>
          <View style={{ gap: space[2], marginBottom: space[3] }}>
            {summary.records.map((t) => (
              <View key={t.id} style={{ gap: 2 }}>
                <TransactionListItem
                  transaction={t}
                  variant="record"
                  onPress={() =>
                    router.push({ pathname: '/transactions/[id]', params: { id: t.id } })
                  }
                />
                <Text variant="small" tone="muted" style={{ paddingHorizontal: space[2] }}>
                  Fees & taxes {formatTzs(chargesOf(t))}
                </Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
        Worked out from what each message states. A VAT already inside a fee is counted once, under
        VAT, so the lines add up to the total.
      </Text>
    </Screen>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: ChargeRow[]; total: number }) {
  return (
    <Card style={{ marginBottom: space[3], gap: space[3] }}>
      <Text variant="kicker" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {rows.map((row) => {
        const pct = total > 0 ? Math.round((row.amount / total) * 100) : 0;
        return (
          <View
            key={row.key}
            accessible
            accessibilityLabel={`${row.label}: ${formatTzs(row.amount)}, ${pct}%`}
            style={{ gap: space[1] }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
              <Text
                variant="bodyMedium"
                numberOfLines={1}
                style={{ flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14 }}
              >
                {row.label}
              </Text>
              <Text variant="bodyMedium" style={{ fontFamily: fonts.heading, fontSize: 14 }}>
                {formatTzs(row.amount)}
              </Text>
            </View>
            <View
              style={{
                height: BAR_HEIGHT,
                borderRadius: radius.pill,
                backgroundColor: colors.neutralRamp[200],
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  height: '100%',
                  width: `${Math.max(MIN_BAR_PCT, pct)}%`,
                  borderRadius: radius.pill,
                  backgroundColor: colors.accentRamp[500],
                }}
              />
            </View>
          </View>
        );
      })}
    </Card>
  );
}
