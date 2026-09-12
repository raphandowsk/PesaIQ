import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ReviewCard } from '../../components/review/ReviewCard';
import { ReviewProgress } from '../../components/review/ReviewProgress';
import { Icon, Screen, Text } from '../../components/ui';
import { activityStreak } from '../../features/insights';
import { clearedThisWeek, REVIEW_WEEKLY_TARGET, reviewQueue } from '../../features/review/queue';
import { useAppStore } from '../../features/transactions';
import { colors, radius, space } from '../../theme';

const EMPTY_ART = 104;

/**
 * Records the parser was unsure about, each with its uncertain fields ready
 * to correct. Confirming makes a record verified; ignoring keeps it in Records
 * but out of the totals.
 */
export default function Review() {
  const transactions = useAppStore((s) => s.transactions);
  const activity = useAppStore((s) => s.activity);
  const reviewedAt = useAppStore((s) => s.reviewedAt);

  // "This week" and the streak are measured from now, refreshed on each visit.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, []),
  );

  const queue = useMemo(() => reviewQueue(transactions), [transactions]);
  const cleared = clearedThisWeek(reviewedAt, now);
  const streak = activityStreak(activity, now);

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[4], marginBottom: space[3], gap: space[1] }}>
        <Text variant="h1" accessibilityRole="header" style={{ fontSize: 26 }}>
          Review
        </Text>
        <Text variant="small" tone="muted">
          Fields the parser was unsure about. Confirming makes a record verified.
        </Text>
      </View>

      <ReviewProgress cleared={cleared} target={REVIEW_WEEKLY_TARGET} streak={streak} />

      {queue.length === 0 ? (
        <QueueClear />
      ) : (
        <View style={{ gap: space[3] }}>
          {queue.map((t) => (
            <ReviewCard
              key={t.id}
              transaction={t}
              onOpen={() => router.push({ pathname: '/transactions/[id]', params: { id: t.id } })}
            />
          ))}
        </View>
      )}
    </Screen>
  );
}

function QueueClear() {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[4] }}>
      <View
        style={{
          width: EMPTY_ART,
          height: EMPTY_ART,
          borderRadius: radius.pill,
          backgroundColor: colors.accent2Ramp[300],
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space[4],
        }}
      >
        <Icon name="check" size={46} color={colors.accent2Ramp[900]} />
      </View>
      <Text variant="h2" accessibilityRole="header" style={{ textAlign: 'center' }}>
        The queue is clear
      </Text>
      <Text
        variant="body"
        tone="muted"
        style={{ textAlign: 'center', marginTop: space[1], maxWidth: 260 }}
      >
        Nothing to review. Every saved record has been confirmed by you.
      </Text>
    </View>
  );
}
