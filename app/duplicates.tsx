import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { TransactionListItem } from '../components/transactions/TransactionListItem';
import { BackButton } from '../components/ui/BackButton';
import { Button, Card, Screen, Text, toast } from '../components/ui';
import { duplicatePairs, useAppStore, type DuplicatePair } from '../features/transactions';
import { formatShortDate } from '../utils/format';
import { space } from '../theme';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

/**
 * Records saved before PesaIQ skipped duplicates, that repeat one saved
 * earlier. Each pair is reviewed by the user: delete the copy, or keep both
 * when they really are two transactions.
 */
export default function Duplicates() {
  const transactions = useAppStore((s) => s.transactions);
  const remove = useAppStore((s) => s.remove);
  const keepBoth = useAppStore((s) => s.keepBoth);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pairs = duplicatePairs(transactions);

  const act = async (pair: DuplicatePair, action: 'delete' | 'keep') => {
    setBusy(pair.copy.id);
    setError(null);
    try {
      if (action === 'delete') {
        await remove(pair.copy.id);
        toast('Copy deleted.');
      } else {
        await keepBoth(pair.copy.id);
        toast('Kept both.');
      }
    } catch {
      setError('That could not be completed. Nothing was changed.');
    } finally {
      setBusy(null);
    }
  };

  const open = (id: string) => router.push({ pathname: '/transactions/[id]', params: { id } });

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingTop: space[3],
          marginBottom: space[2],
        }}
      >
        <BackButton onPress={leave} />
        <Text variant="h2" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
          Possible duplicates
        </Text>
      </View>
      <Text variant="small" tone="muted" style={{ marginBottom: space[4] }}>
        These were saved before PesaIQ started skipping repeats. Each copy has the same transaction
        ID as a record saved earlier.
      </Text>

      {error ? (
        <Text
          variant="small"
          tone="accent"
          style={{ marginBottom: space[3] }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}

      {pairs.length === 0 ? (
        <Card style={{ gap: space[3] }}>
          <Text variant="bodyMedium">No duplicates left.</Text>
          <Button label="Back to Settings" variant="secondary" onPress={leave} />
        </Card>
      ) : (
        <View style={{ gap: space[4] }}>
          {pairs.map((pair) => (
            <Card key={pair.copy.id} style={{ gap: space[3] }}>
              <View style={{ gap: space[1] }}>
                <Text variant="kicker" tone="muted">
                  Saved first · {formatShortDate(new Date(pair.original.createdAt))}
                </Text>
                <TransactionListItem
                  transaction={pair.original}
                  variant="record"
                  onPress={() => open(pair.original.id)}
                />
              </View>
              <View style={{ gap: space[1] }}>
                <Text variant="kicker" tone="muted">
                  Copy · {formatShortDate(new Date(pair.copy.createdAt))}
                </Text>
                <TransactionListItem
                  transaction={pair.copy}
                  variant="record"
                  onPress={() => open(pair.copy.id)}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button
                  label="Delete the copy"
                  variant="danger"
                  loading={busy === pair.copy.id}
                  disabled={busy !== null}
                  onPress={() => void act(pair, 'delete')}
                  style={{ flex: 1 }}
                />
                <Button
                  label="Keep both"
                  variant="secondary"
                  disabled={busy !== null}
                  onPress={() => void act(pair, 'keep')}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
