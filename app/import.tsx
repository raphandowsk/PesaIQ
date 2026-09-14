import { useCallback } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { BackButton } from '../components/ui/BackButton';
import { Button, Card, Icon, Screen, Text } from '../components/ui';
import {
  chosenItems,
  countByStatus,
  IMPORT_DAYS,
  IMPORT_SENDERS,
  SELECTABLE,
  useImportStore,
  type ImportItem,
  type ImportStatus,
} from '../features/import';
import { TZ_TYPE_LABELS } from '../features/parser/tz';
import { colors, fonts, MIN_TOUCH, radius, shadow, space } from '../theme';
import { TYPE_LABELS } from '../types/domain';
import { formatAmount, formatLongDate, formatTzs } from '../utils/format';
import { maskIdentifiersInText } from '../utils/privacy';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

/** Rows drawn in the preview. The rest are counted, and handled the same way. */
const LIST_LIMIT = 150;
const INPUT_MIN_HEIGHT = 220;
const BOX = 22;

/** The preview's summary, in the order a person reads it. */
const SUMMARY: [ImportStatus, string][] = [
  ['save', 'To save'],
  ['review', 'Saved for you to check'],
  ['repeat', 'Repeats, skipped'],
  ['old', `Older than ${IMPORT_DAYS} days, left out`],
  ['notMoney', 'Not money, left out'],
  ['secret', 'One-time codes, never stored'],
  ['tooLong', 'Too long to read, left out'],
];

/**
 * The account's one bulk import: paste up to 90 days of messages, see what
 * each one is and what happens to it, then import. Nothing is saved, and the
 * import is not used up, until "Import" is tapped.
 */
export default function ImportMessages() {
  const phase = useImportStore((s) => s.phase);
  const progress = useImportStore((s) => s.progress);
  const check = useImportStore((s) => s.check);

  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check]),
  );

  const busy = phase === 'reading' || phase === 'importing';

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
        {busy ? <View style={{ width: MIN_TOUCH }} /> : <BackButton onPress={leave} />}
        <Text variant="h2" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
          Import past messages
        </Text>
      </View>

      {phase === 'checking' ? <Waiting label="Checking your account" /> : null}
      {phase === 'unavailable' ? <Unavailable /> : null}
      {phase === 'used' ? <Used /> : null}
      {phase === 'ready' ? <Paste /> : null}
      {phase === 'reading' ? (
        <Waiting
          label={`Reading messages… ${formatAmount(progress.done)} of ${formatAmount(progress.total)}`}
        />
      ) : null}
      {phase === 'preview' ? <Preview /> : null}
      {phase === 'importing' ? (
        <Waiting
          label={
            progress.done === 0
              ? 'Starting the import'
              : `Saving ${formatAmount(progress.done)} of ${formatAmount(progress.total)}`
          }
        />
      ) : null}
      {phase === 'done' ? <Done /> : null}
    </Screen>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ alignItems: 'center', gap: space[3], paddingVertical: space[8] }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text variant="small" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function Note({ children }: { children: string }) {
  return (
    <View
      style={{
        backgroundColor: colors.accent2Ramp[200],
        borderRadius: radius.md,
        padding: space[3],
        marginBottom: space[3],
      }}
    >
      <Text
        variant="small"
        style={{ fontSize: 12, lineHeight: 18, color: colors.accent2Ramp[900] }}
      >
        {children}
      </Text>
    </View>
  );
}

function ErrorLine() {
  const error = useImportStore((s) => s.error);
  if (!error) return null;
  return (
    <Text
      variant="small"
      tone="accent"
      style={{ marginBottom: space[3] }}
      accessibilityLiveRegion="polite"
    >
      {error}
    </Text>
  );
}

function Unavailable() {
  return (
    <Card style={{ gap: space[2] }}>
      <Text variant="bodyMedium" style={{ fontFamily: fonts.bold }}>
        Import isn&apos;t available
      </Text>
      <Text variant="small" tone="muted">
        It needs the PesaIQ server, which this copy of the app was built without. You can still
        paste messages one at a time in the Lab.
      </Text>
    </Card>
  );
}

function Used() {
  const usedAt = useImportStore((s) => s.usedAt);
  return (
    <>
      <ErrorLine />
      <Card style={{ gap: space[2], marginBottom: space[4] }}>
        <Text variant="bodyMedium" style={{ fontFamily: fonts.bold }}>
          Your import has been used
        </Text>
        <Text variant="small" tone="muted">
          {usedAt
            ? `This account's one bulk import was used on ${formatLongDate(new Date(usedAt))}.`
            : "This account's one bulk import has been used."}{' '}
          Add new messages one at a time: paste them in the Lab.
        </Text>
      </Card>
      <Button label="Open the Lab" size="lg" onPress={() => router.replace('/parser-lab')} />
    </>
  );
}

function Paste() {
  const text = useImportStore((s) => s.text);
  const setText = useImportStore((s) => s.setText);
  const senderKey = useImportStore((s) => s.senderKey);
  const setSender = useImportStore((s) => s.setSender);
  const read = useImportStore((s) => s.read);

  return (
    <>
      <Text variant="body" style={{ marginBottom: space[4], color: colors.neutralRamp[800] }}>
        Paste up to {IMPORT_DAYS} days of money messages at once. Each one is read on this phone,
        and you see what will be saved before anything is.
      </Text>

      <Text variant="kicker" tone="muted" style={{ marginBottom: space[2] }}>
        Which conversation are they from?
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[4] }}
      >
        {IMPORT_SENDERS.map((s) => {
          const on = s.key === senderKey;
          return (
            <Pressable
              key={s.key}
              onPress={() => setSender(s.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={s.label}
              style={({ pressed }) => ({
                minHeight: MIN_TOUCH,
                paddingHorizontal: space[3],
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 1,
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
                  color: on ? colors.accentRamp[900] : colors.neutralRamp[800],
                }}
              >
                {s.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ padding: space[3], marginBottom: space[3], gap: space[2] }}>
        <TextInput
          multiline
          value={text}
          onChangeText={setText}
          placeholder="Paste your messages here…"
          placeholderTextColor={colors.neutralRamp[700]}
          accessibilityLabel="Messages to import"
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            minHeight: INPUT_MIN_HEIGHT,
            maxHeight: INPUT_MIN_HEIGHT * 2,
            borderWidth: 1,
            borderColor: colors.neutralRamp[300],
            borderRadius: radius.md,
            backgroundColor: colors.bg,
            padding: space[3],
            fontFamily: fonts.mono,
            fontSize: 13,
            lineHeight: 20,
            color: colors.text,
            textAlignVertical: 'top',
          }}
        />
        <Text variant="small" tone="muted" style={{ fontSize: 11 }}>
          {formatAmount(text.length)} characters
        </Text>
      </Card>

      <ErrorLine />
      <Note>
        You can import once per account. One-time codes are left out and never stored, and nothing
        is saved until you confirm.
      </Note>
      <Button
        label="Read messages"
        size="lg"
        disabled={!text.trim()}
        onPress={() => void read()}
        style={shadow.md}
      />
    </>
  );
}

function Preview() {
  const items = useImportStore((s) => s.items);
  const leftOut = useImportStore((s) => s.leftOut);
  const toggle = useImportStore((s) => s.toggle);
  const edit = useImportStore((s) => s.edit);
  const run = useImportStore((s) => s.run);

  const counts = countByStatus(items);
  const chosen = chosenItems(items, leftOut).length;
  // What can be chosen first, in the order pasted.
  const shown = [...items]
    .sort((a, b) => Number(isChoosable(b)) - Number(isChoosable(a)))
    .slice(0, LIST_LIMIT);

  return (
    <>
      <Card style={{ marginBottom: space[4], gap: space[1] }}>
        <Text variant="kicker" tone="muted" style={{ marginBottom: space[1] }}>
          {formatAmount(items.length)} {items.length === 1 ? 'message' : 'messages'} found
        </Text>
        {SUMMARY.filter(([status]) => counts[status] > 0).map(([status, label]) => (
          <View
            key={status}
            accessible
            accessibilityLabel={`${label}: ${counts[status]}`}
            style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}
          >
            <Text variant="small" style={{ color: colors.neutralRamp[800] }}>
              {label}
            </Text>
            <Text variant="small" style={{ fontFamily: fonts.bold }}>
              {formatAmount(counts[status])}
            </Text>
          </View>
        ))}
      </Card>

      <Text variant="kicker" tone="muted" style={{ marginBottom: space[2] }}>
        Messages · tap to leave one out
      </Text>
      <View style={{ gap: space[2], marginBottom: space[4] }}>
        {shown.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            on={!leftOut.includes(item.id)}
            onToggle={() => toggle(item.id)}
          />
        ))}
        {items.length > LIST_LIMIT ? (
          <Text variant="small" tone="muted">
            And {formatAmount(items.length - LIST_LIMIT)} more, handled as the summary says.
          </Text>
        ) : null}
      </View>

      <ErrorLine />
      <Note>
        This is your one bulk import for this account: it can&apos;t be run again. Records you
        don&apos;t want can be deleted afterwards.
      </Note>
      <Button
        label={
          chosen === 0
            ? 'Nothing to import'
            : `Import ${formatAmount(chosen)} ${chosen === 1 ? 'message' : 'messages'}`
        }
        size="lg"
        disabled={chosen === 0}
        onPress={() => void run()}
        style={shadow.md}
      />
      <Button
        label="Change what I pasted"
        variant="ghost"
        onPress={edit}
        style={{ marginTop: space[2] }}
      />
    </>
  );
}

const isChoosable = (item: ImportItem) => SELECTABLE.includes(item.status);

function describeItem(item: ImportItem): { title: string; sub: string } {
  const r = item.result;
  if (!r) return { title: item.note ?? 'Left out', sub: '' };
  const kind = r.details.kind ? TZ_TYPE_LABELS[r.details.kind] : TYPE_LABELS[r.type];
  const title = r.amount != null ? `${kind} · ${formatTzs(r.amount)}` : kind;
  const facts = [r.counterparty, r.transactionDate, r.provider].filter(Boolean).join(' · ');
  // Numbers masked, as on every screen.
  const firstLine = maskIdentifiersInText(item.text.split('\n')[0] ?? '');
  return { title, sub: facts || firstLine };
}

function ItemRow({ item, on, onToggle }: { item: ImportItem; on: boolean; onToggle: () => void }) {
  const choosable = isChoosable(item);
  const { title, sub } = describeItem(item);
  const label = `${title}. ${sub}. ${choosable ? (on ? 'Will be imported.' : 'Left out.') : (item.note ?? '')}`;

  const content = (
    <>
      {choosable ? (
        <View
          style={{
            width: BOX,
            height: BOX,
            borderRadius: radius.sm,
            borderWidth: 2,
            borderColor: on ? colors.accent2Ramp[600] : colors.neutralRamp[500],
            backgroundColor: on ? colors.accent2Ramp[600] : colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {on ? <Icon name="check" size={13} strokeWidth={3.4} color={colors.surface} /> : null}
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="small" numberOfLines={1} style={{ fontFamily: fonts.bold }}>
          {title}
        </Text>
        {sub ? (
          <Text variant="small" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
            {sub}
          </Text>
        ) : null}
        {item.note && item.result ? (
          <Text variant="small" style={{ fontSize: 11, color: colors.accentRamp[800] }}>
            {item.note}
          </Text>
        ) : null}
      </View>
    </>
  );

  const rowStyle = {
    minHeight: MIN_TOUCH,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[3],
    borderWidth: 1,
    borderColor: colors.neutralRamp[300],
    borderRadius: radius.md,
    padding: space[3],
  };

  return choosable ? (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        ...rowStyle,
        backgroundColor: pressed ? colors.accentRamp[100] : colors.surface,
      })}
    >
      {content}
    </Pressable>
  ) : (
    <View
      accessible
      accessibilityLabel={label}
      style={{ ...rowStyle, backgroundColor: colors.neutralRamp[200] }}
    >
      {content}
    </View>
  );
}

function Done() {
  const outcome = useImportStore((s) => s.outcome);

  return (
    <>
      <ErrorLine />
      {outcome ? (
        <Card style={{ gap: space[2], marginBottom: space[4] }} accessibilityLiveRegion="polite">
          <Text variant="h3" accessibilityRole="header">
            {formatAmount(outcome.saved)} {outcome.saved === 1 ? 'record' : 'records'} imported
          </Text>
          <Text variant="small" tone="muted">
            {outcome.forReview > 0
              ? `${formatAmount(outcome.forReview)} ${outcome.forReview === 1 ? 'is' : 'are'} waiting in Review for you to check.`
              : 'All of them are ready.'}
            {outcome.repeats > 0
              ? ` ${formatAmount(outcome.repeats)} ${outcome.repeats === 1 ? 'was' : 'were'} already saved, and skipped.`
              : ''}{' '}
            From now on, paste new messages one at a time in the Lab.
          </Text>
        </Card>
      ) : null}
      <View style={{ gap: space[2] }}>
        {outcome && outcome.forReview > 0 ? (
          <Button label="Go to Review" size="lg" onPress={() => router.replace('/review')} />
        ) : null}
        <Button
          label="View records"
          variant={outcome && outcome.forReview > 0 ? 'secondary' : 'primary'}
          size="lg"
          onPress={() => router.replace('/transactions')}
        />
      </View>
    </>
  );
}
