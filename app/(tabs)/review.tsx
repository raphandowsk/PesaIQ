import { useState } from 'react';
import { View } from 'react-native';

import { TransactionRow } from '../../components/transactions/TransactionRow';
import { Button, Card, Screen, Tag, Text } from '../../components/ui';
import { needsReview, useAppStore } from '../../features/transactions';
import { space } from '../../theme';

/**
 * Interim review queue. Confirm and Ignore are real; the progress ring, streak
 * and field-by-field correction arrive in 1H.
 */
export default function Review() {
  const transactions = useAppStore((s) => s.transactions);
  const confirm = useAppStore((s) => s.confirm);
  const ignore = useAppStore((s) => s.ignore);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queue = needsReview(transactions);

  const act = async (id: string, action: (id: string) => Promise<void>) => {
    setBusyId(id);
    setError(null);
    try {
      await action(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change could not be saved.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="title">Review</Text>
        <Text variant="body" tone="muted">
          Fields the parser was unsure about. Confirming makes a record verified.
        </Text>
        <Tag label="Preview · corrections in 1H" tone="neutral" />
      </View>

      {error ? (
        <Text
          variant="small"
          tone="accent"
          style={{ marginTop: space[3] }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}

      <View style={{ marginTop: space[4], gap: space[2] }}>
        {queue.length === 0 ? (
          <Card style={{ gap: space[1] }}>
            <Text variant="h3">Queue is clear</Text>
            <Text variant="small" tone="muted">
              Nothing to review. Every saved record has been confirmed by you.
            </Text>
          </Card>
        ) : (
          queue.map((t) => (
            <TransactionRow
              key={t.id}
              transaction={t}
              actions={
                <>
                  <Button
                    label="Confirm"
                    variant="secondary"
                    loading={busyId === t.id}
                    disabled={busyId !== null}
                    onPress={() => void act(t.id, confirm)}
                    accessibilityLabel={`Confirm record for ${t.counterparty ?? 'unnamed'}`}
                  />
                  <Button
                    label="Ignore"
                    variant="ghost"
                    disabled={busyId !== null}
                    onPress={() => void act(t.id, ignore)}
                    accessibilityLabel={`Ignore record for ${t.counterparty ?? 'unnamed'}`}
                  />
                </>
              }
            />
          ))
        )}
      </View>
    </Screen>
  );
}
