import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TransactionListItem } from '../../components/transactions/TransactionListItem';
import { Button, Icon, Text } from '../../components/ui';
import { useAppStore } from '../../features/transactions';
import {
  DEFAULT_RECORD_QUERY,
  extraFilterCount,
  filterRecords,
  groupByDay,
  providerOptions,
  RECORD_FILTERS,
  RECORD_PERIODS,
  type RecordQuery,
} from '../../features/transactions/records';
import { colors, fonts, HIT_SLOP, MIN_TOUCH, radius, space } from '../../theme';

const EMPTY_ART = 104;
const Gap = () => <View style={{ height: space[2] }} />;

/**
 * Every record, searchable and filterable, grouped by the day it happened.
 * A SectionList rather than a mapped ScrollView, so a long history stays fast.
 */
export default function Records() {
  const transactions = useAppStore((s) => s.transactions);

  const [query, setQuery] = useState<RecordQuery>(DEFAULT_RECORD_QUERY);
  const [moreOpen, setMoreOpen] = useState(false);
  // "Last 7 days" is measured from now, refreshed each time the tab is shown.
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(
    useCallback(() => {
      setNow(new Date());
    }, []),
  );

  const records = useMemo(
    () => filterRecords(transactions, query, now),
    [transactions, query, now],
  );
  const sections = useMemo(() => groupByDay(records), [records]);
  const providers = useMemo(() => providerOptions(transactions), [transactions]);

  const extra = extraFilterCount(query);
  const narrowed = query.filter !== 'all' || query.search.trim() !== '' || extra > 0;
  const update = (patch: Partial<RecordQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const open = (id: string) => router.push({ pathname: '/transactions/[id]', params: { id } });

  // An element, not a component: re-rendering it keeps the search box focused.
  const header = (
    <View style={{ paddingTop: space[4], gap: space[3], marginBottom: space[1] }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
      >
        <Text variant="h1" accessibilityRole="header" style={{ fontSize: 26 }}>
          Transactions
        </Text>
        <Text variant="small" tone="muted">
          {records.length} of {transactions.length}
        </Text>
      </View>

      <SearchBox value={query.search} onChange={(search) => update({ search })} />

      <ChipRow>
        {RECORD_FILTERS.map((f) => (
          <Chip
            key={f.key}
            label={f.label}
            on={query.filter === f.key}
            onPress={() => update({ filter: f.key })}
          />
        ))}
        <Chip
          label={extra > 0 ? `More filters · ${extra}` : 'More filters'}
          on={extra > 0}
          quiet
          expanded={moreOpen}
          onPress={() => setMoreOpen((o) => !o)}
        />
      </ChipRow>

      {moreOpen ? (
        <View style={{ gap: space[2] }}>
          <Text variant="kicker" tone="muted">
            Provider
          </Text>
          <ChipRow>
            {[null, ...providers].map((p) => (
              <Chip
                key={p ?? 'all'}
                label={p ?? 'All providers'}
                on={query.provider === p}
                onPress={() => update({ provider: p })}
              />
            ))}
          </ChipRow>
          <Text variant="kicker" tone="muted">
            Period
          </Text>
          <ChipRow>
            {RECORD_PERIODS.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                on={query.period === p.key}
                onPress={() => update({ period: p.key })}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => (
          <Text
            variant="kicker"
            tone="muted"
            accessibilityRole="header"
            style={{ marginTop: space[4], marginBottom: space[2] }}
          >
            {section.title}
          </Text>
        )}
        renderItem={({ item }) => (
          <TransactionListItem transaction={item} variant="record" onPress={() => open(item.id)} />
        )}
        ItemSeparatorComponent={Gap}
        ListEmptyComponent={
          <EmptyState
            hasRecords={transactions.length > 0}
            narrowed={narrowed}
            onClear={() => setQuery(DEFAULT_RECORD_QUERY)}
          />
        }
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[8] }}
      />
    </SafeAreaView>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.neutralRamp[300],
        borderRadius: radius.pill,
        paddingLeft: space[3],
        paddingRight: space[1],
      }}
    >
      <Icon name="search" size={18} color={colors.neutralRamp[700]} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search name, reference…"
        placeholderTextColor={colors.neutralRamp[700]}
        accessibilityLabel="Search records"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        style={{
          flex: 1,
          minHeight: MIN_TOUCH,
          fontFamily: fonts.regular,
          fontSize: 14,
          color: colors.text,
        }}
      />
      {value ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="close" size={16} color={colors.neutralRamp[700]} />
        </Pressable>
      ) : null}
    </View>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 7 }}
    >
      {children}
    </ScrollView>
  );
}

function Chip({
  label,
  on,
  onPress,
  quiet = false,
  expanded,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** The "More filters" toggle: outlined rather than filled when active. */
  quiet?: boolean;
  expanded?: boolean;
}) {
  const tone = on
    ? quiet
      ? { bg: colors.accentRamp[100], fg: colors.accentRamp[800], border: colors.accent }
      : { bg: colors.accent, fg: colors.bg, border: colors.accent }
    : { bg: colors.surface, fg: colors.neutralRamp[800], border: colors.neutralRamp[300] };

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={expanded === undefined ? { selected: on } : { expanded }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH,
        paddingHorizontal: space[4],
        borderRadius: radius.pill,
        borderWidth: 1,
        justifyContent: 'center',
        borderColor: tone.border,
        backgroundColor: pressed && !on ? colors.neutralRamp[200] : tone.bg,
      })}
    >
      <Text variant="small" style={{ fontFamily: fonts.bold, color: tone.fg }}>
        {label}
      </Text>
    </Pressable>
  );
}

function EmptyState({
  hasRecords,
  narrowed,
  onClear,
}: {
  hasRecords: boolean;
  narrowed: boolean;
  onClear: () => void;
}) {
  const filteredOut = hasRecords && narrowed;

  return (
    <View style={{ alignItems: 'center', paddingVertical: space[8], paddingHorizontal: space[4] }}>
      <View
        style={{
          width: EMPTY_ART,
          height: EMPTY_ART,
          borderRadius: radius.pill,
          backgroundColor: colors.accent2Ramp[200],
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: space[4],
        }}
      >
        <Icon name="message" size={44} color={colors.accent2Ramp[700]} />
      </View>
      <Text variant="h2" accessibilityRole="header" style={{ textAlign: 'center' }}>
        Nothing here yet
      </Text>
      <Text
        variant="body"
        tone="muted"
        style={{ textAlign: 'center', marginTop: space[1], maxWidth: 260 }}
      >
        {filteredOut
          ? 'No records match these filters.'
          : 'No records yet. Paste a message in the Parser Lab to add one.'}
      </Text>
      {filteredOut ? (
        <Button
          label="Clear filters"
          variant="secondary"
          onPress={onClear}
          style={{ marginTop: space[4] }}
        />
      ) : (
        <Button
          label="Analyze an SMS"
          onPress={() => router.push('/parser-lab')}
          style={{ marginTop: space[4] }}
        />
      )}
    </View>
  );
}
