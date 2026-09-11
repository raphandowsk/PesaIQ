import { router } from 'expo-router';
import { View } from 'react-native';

import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button, Card, Screen, Tag, Text } from '../../components/ui';
import { useAppStore } from '../../features/transactions';
import { space } from '../../theme';

/** Interim Records list. Search, filters, date groups and detail arrive in 1G. */
export default function Records() {
  const transactions = useAppStore((s) => s.transactions);

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="title">Transactions</Text>
        <Text variant="body" tone="muted">
          {transactions.length} {transactions.length === 1 ? 'record' : 'records'}
        </Text>
        <Tag label="Preview · search and filters in 1G" tone="neutral" />
      </View>

      <View style={{ marginTop: space[4], gap: space[2] }}>
        {transactions.length === 0 ? (
          <Card style={{ gap: space[2] }}>
            <Text variant="h3">Nothing here</Text>
            <Text variant="small" tone="muted">
              No records yet. Paste a message in the Parser Lab to add one.
            </Text>
            <Button
              label="Analyze SMS"
              variant="secondary"
              onPress={() => router.push('/parser-lab')}
              style={{ alignSelf: 'flex-start' }}
            />
          </Card>
        ) : (
          transactions.map((t) => <TransactionRow key={t.id} transaction={t} />)
        )}
      </View>
    </Screen>
  );
}
