import { router } from 'expo-router';
import { View } from 'react-native';

import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button, Card, Screen, Tag, Text } from '../../components/ui';
import { summarize, useAppStore } from '../../features/transactions';
import { colors, money, space } from '../../theme';
import { formatAmount } from '../../utils/format';

/**
 * Interim Home.
 *
 * The totals, review count, recent records and demo notice are real and read
 * from SQLite. The health score, category breakdown and tips arrive in 1F.
 */
export default function Dashboard() {
  const transactions = useAppStore((s) => s.transactions);
  const demoOn = useAppStore((s) => s.settings.demoDataEnabled);
  const clearDemoData = useAppStore((s) => s.clearDemoData);

  const summary = summarize(transactions);
  const recent = transactions.slice(0, 3);

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="kicker" tone="accent">
          Home
        </Text>
        <Text variant="title">Your financial activity</Text>
        <Tag label="Preview · full dashboard in 1F" tone="neutral" />
      </View>

      <View style={{ flexDirection: 'row', gap: space[3], marginTop: space[6] }}>
        <Stat
          label="Received"
          value={formatAmount(summary.received)}
          tint={money.in.tint}
          ink={money.in.ink}
        />
        <Stat
          label="Sent"
          value={formatAmount(summary.sent)}
          tint={money.out.tint}
          ink={money.out.ink}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: space[3], marginTop: space[3] }}>
        <Stat label="Records" value={String(summary.count)} />
        <Stat label="Needs review" value={String(summary.needsReview)} />
      </View>

      {demoOn ? (
        <Card
          elevation="none"
          style={{ marginTop: space[4], backgroundColor: colors.accentRamp[100], gap: space[2] }}
        >
          <Text variant="small" style={{ color: colors.accentRamp[800] }}>
            Demo data is on. These records are generated samples, not real messages.
          </Text>
          <Button
            label="Remove demo data"
            variant="ghost"
            onPress={() => void clearDemoData()}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>
      ) : null}

      <Button
        label="Analyze SMS"
        size="lg"
        onPress={() => router.push('/parser-lab')}
        style={{ marginTop: space[4] }}
      />

      <View style={{ marginTop: space[6], gap: space[2] }}>
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text variant="kicker" tone="muted">
            Recent records
          </Text>
          {transactions.length > recent.length ? (
            <Button
              label={`All ${transactions.length}`}
              variant="ghost"
              onPress={() => router.push('/transactions')}
            />
          ) : null}
        </View>

        {recent.length === 0 ? (
          <Card>
            <Text variant="h3">No records yet</Text>
            <Text variant="small" tone="muted">
              Paste a message in the Lab to create your first one.
            </Text>
          </Card>
        ) : (
          recent.map((t) => <TransactionRow key={t.id} transaction={t} />)
        )}
      </View>
    </Screen>
  );
}

function Stat({
  label,
  value,
  tint = colors.surface,
  ink,
}: {
  label: string;
  value: string;
  tint?: string;
  ink?: string;
}) {
  return (
    <Card
      elevation={tint === colors.surface ? 'sm' : 'none'}
      style={{ flex: 1, backgroundColor: tint, gap: space[1] }}
      accessible
      accessibilityLabel={`${label}: ${value}`}
    >
      <Text variant="kicker" style={ink ? { color: ink } : undefined} tone="muted">
        {label}
      </Text>
      <Text variant="amount" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </Card>
  );
}
