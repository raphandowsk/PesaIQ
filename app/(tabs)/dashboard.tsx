import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CategoryCard } from '../../components/dashboard/CategoryCard';
import { FeesCard } from '../../components/dashboard/FeesCard';
import { HealthCard } from '../../components/dashboard/HealthCard';
import { ProviderSummary } from '../../components/dashboard/ProviderSummary';
import { ScoreBreakdown } from '../../components/dashboard/ScoreBreakdown';
import { TipCard } from '../../components/dashboard/TipCard';
import { TransactionListItem } from '../../components/transactions/TransactionListItem';
import { Button, Card, Icon, Screen, Text, toast, type IconName } from '../../components/ui';
import {
  activityStreak,
  categoryBreakdown,
  computeHealth,
  earnTips,
  feesSummary,
  providerSummary,
  spendTips,
  type CategoryMode,
} from '../../features/insights';
import { needsReview, useAppStore } from '../../features/transactions';
import { colors, fonts, HIT_SLOP, MIN_TOUCH, radius, shadow, space } from '../../theme';
import { formatLongDate, greetingFor } from '../../utils/format';
import { useReduceMotion } from '../../utils/useReduceMotion';

const HEADER_BUTTON = 44;
const MARK = 44;
const NUDGE_ICON = 40;
const DOT = 9;
const RECENT_COUNT = 3;

/**
 * Home: financial health, what builds it, spending and income by category,
 * tips drawn from the user's own records, recent records, and providers.
 * Everything here is derived from saved records by pure functions in
 * `features/insights`, so the screen only lays them out.
 */
export default function Dashboard() {
  const transactions = useAppStore((s) => s.transactions);
  const activity = useAppStore((s) => s.activity);
  const demoOn = useAppStore((s) => s.settings.demoDataEnabled);
  const clearDemoData = useAppStore((s) => s.clearDemoData);
  const reduceMotion = useReduceMotion();

  const [mode, setMode] = useState<CategoryMode>('spend');
  const [removing, setRemoving] = useState(false);
  // Each visit to Home replays the count-up and bars, as the design does, and
  // refreshes the clock that the greeting and the streak read.
  const [visit, setVisit] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setVisit((v) => v + 1);
      setNow(new Date());
    }, []),
  );

  const health = useMemo(() => computeHealth(transactions), [transactions]);
  const spend = useMemo(() => categoryBreakdown(transactions, 'spend'), [transactions]);
  const earn = useMemo(() => categoryBreakdown(transactions, 'earn'), [transactions]);
  const providers = useMemo(() => providerSummary(transactions), [transactions]);
  const fees = useMemo(() => feesSummary(transactions, 'month', now), [transactions, now]);

  const spendList = health ? spendTips(health, spend) : [];
  const earnList = health ? earnTips(health, earn, transactions) : [];
  const streak = activityStreak(activity, now);
  const reviewCount = needsReview(transactions).length;
  const recent = transactions.slice(0, RECENT_COUNT);
  const animate = !reduceMotion;

  const removeDemo = async () => {
    setRemoving(true);
    try {
      await clearDemoData();
      toast('Demo data removed.');
    } catch {
      toast('Could not remove demo data. Nothing was changed.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Screen scroll>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          paddingTop: space[4],
          marginBottom: space[4],
        }}
      >
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            width: MARK,
            height: MARK,
            borderRadius: radius.pill,
            backgroundColor: colors.accent2Ramp[400],
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            variant="bodyMedium"
            style={{ fontFamily: fonts.heading, fontSize: 16, color: colors.accent2Ramp[900] }}
          >
            P
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="bodyMedium"
            accessibilityRole="header"
            style={{ fontFamily: fonts.heading, fontSize: 17, lineHeight: 21 }}
          >
            {greetingFor(now)}
          </Text>
          <Text variant="small" tone="muted">
            {formatLongDate(now)}
          </Text>
        </View>
        <HeaderButton
          icon="plus"
          label="Analyze an SMS"
          ink={colors.accentRamp[700]}
          onPress={() => router.push('/parser-lab')}
        />
        <HeaderButton
          icon="bell"
          label={reviewCount > 0 ? `Review, ${reviewCount} waiting` : 'Review'}
          dot={reviewCount > 0}
          onPress={() => router.push('/review')}
        />
      </View>

      {health ? (
        <>
          <HealthCard health={health} streak={streak} animate={animate} replay={visit} />
          <ScoreBreakdown health={health} animate={animate} replay={visit} />
        </>
      ) : (
        <NoScoreYet />
      )}

      {reviewCount > 0 ? <ReviewNudge count={reviewCount} /> : null}

      {health ? (
        <CategoryCard
          spend={spend}
          earn={earn}
          mode={mode}
          onModeChange={setMode}
          animate={animate}
          replay={visit}
        />
      ) : null}

      {health ? <FeesCard summary={fees} /> : null}

      {spendList.length > 0 ? (
        <Section title="Spend smarter" subtitle="Tips drawn from your own transactions">
          {spendList.map((tip) => (
            <TipCard key={tip.title} tip={tip} tone="spend" />
          ))}
        </Section>
      ) : null}

      {earnList.length > 0 ? (
        <Section title="Earn more" subtitle="And keep it easy to trace">
          {earnList.map((tip) => (
            <TipCard key={tip.title} tip={tip} tone="earn" />
          ))}
        </Section>
      ) : null}

      {recent.length > 0 ? (
        <View style={{ marginBottom: space[4] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: space[2],
            }}
          >
            <SectionTitle>Recent transactions</SectionTitle>
            <Pressable
              onPress={() => router.push('/transactions')}
              accessibilityRole="button"
              accessibilityLabel={`All ${transactions.length} records`}
              style={{
                minHeight: MIN_TOUCH,
                justifyContent: 'center',
                paddingHorizontal: space[2],
              }}
            >
              <Text
                variant="small"
                style={{ fontFamily: fonts.bold, color: colors.accentRamp[700] }}
              >
                All {transactions.length} →
              </Text>
            </Pressable>
          </View>
          <View style={{ gap: space[2] }}>
            {recent.map((t) => (
              <TransactionListItem
                key={t.id}
                transaction={t}
                onPress={() =>
                  router.push({ pathname: '/transactions/[id]', params: { id: t.id } })
                }
              />
            ))}
          </View>
        </View>
      ) : null}

      <ProviderSummary rows={providers} />

      {demoOn ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            backgroundColor: colors.neutralRamp[200],
            borderRadius: radius.md,
            padding: space[3],
            marginBottom: space[4],
          }}
        >
          <Text variant="small" style={{ flex: 1, color: colors.neutralRamp[700] }}>
            <Text
              variant="small"
              style={{ fontFamily: fonts.bold, color: colors.neutralRamp[700] }}
            >
              Demo data is on.
            </Text>{' '}
            These records are generated samples, not real messages.
          </Text>
          <Button
            label="Remove"
            accessibilityLabel="Remove demo data"
            variant="secondary"
            loading={removing}
            disabled={removing}
            onPress={() => void removeDemo()}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
  ink = colors.neutralRamp[800],
  dot = false,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  ink?: string;
  dot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: HEADER_BUTTON,
          height: HEADER_BUTTON,
          borderRadius: radius.pill,
          backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shadow.sm,
      ]}
    >
      <Icon name={icon} color={ink} />
      {dot ? (
        <View
          style={{
            position: 'absolute',
            top: 7,
            right: 8,
            width: DOT,
            height: DOT,
            borderRadius: radius.pill,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      variant="h3"
      accessibilityRole="header"
      style={{ fontFamily: fonts.heading, fontSize: 19, lineHeight: 24 }}
    >
      {children}
    </Text>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View style={{ marginBottom: space[6] }}>
      <SectionTitle>{title}</SectionTitle>
      <Text variant="small" tone="muted" style={{ marginBottom: space[3] }}>
        {subtitle}
      </Text>
      <View style={{ gap: space[2] }}>{children}</View>
    </View>
  );
}

function ReviewNudge({ count }: { count: number }) {
  const label = `${count} ${count === 1 ? 'needs' : 'need'} review`;

  return (
    <Pressable
      onPress={() => router.push('/review')}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Each review raises your score.`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        backgroundColor: pressed ? colors.accentRamp[300] : colors.accentRamp[200],
        borderRadius: radius.lg,
        padding: space[4],
        marginBottom: space[6],
      })}
    >
      <View
        style={{
          width: NUDGE_ICON,
          height: NUDGE_ICON,
          borderRadius: radius.pill,
          backgroundColor: colors.accentRamp[400],
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name="warning" color={colors.accentRamp[900]} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          variant="bodyMedium"
          style={{ fontFamily: fonts.heading, fontSize: 14, color: colors.accentRamp[900] }}
        >
          {label}
        </Text>
        <Text variant="small" style={{ color: colors.accentRamp[800] }}>
          Each review raises your score
        </Text>
      </View>
      <Icon name="chevronRight" size={18} color={colors.accentRamp[800]} />
    </Pressable>
  );
}

/**
 * Shown instead of a score when there are no records. The prototype would show
 * 20 ("Strained") for an empty ledger; a score built from nothing would mislead.
 */
function NoScoreYet() {
  return (
    <Card
      elevation="none"
      style={{ backgroundColor: colors.accent2Ramp[200], gap: space[2], marginBottom: space[6] }}
    >
      <Text variant="kicker" style={{ color: colors.accent2Ramp[800] }}>
        Financial health
      </Text>
      <Text variant="h2" style={{ color: colors.accent2Ramp[900] }}>
        No score yet
      </Text>
      <Text variant="small" style={{ color: colors.accent2Ramp[900] }}>
        Your score is built from your records: how much you keep, how many you have verified, and
        how traceable they are. Save your first message to see it.
      </Text>
      <Button
        label="Analyze an SMS"
        onPress={() => router.push('/parser-lab')}
        style={{ alignSelf: 'flex-start', marginTop: space[2] }}
      />
    </Card>
  );
}
