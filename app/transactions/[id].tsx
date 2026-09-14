import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { router, useLocalSearchParams } from 'expo-router';

import { FieldRow } from '../../components/parser/FieldRow';
import { BackButton } from '../../components/ui/BackButton';
import { Button, Card, Icon, Screen, Text, toast } from '../../components/ui';
import { ChargesBreakdown } from '../../components/fees/ChargesBreakdown';
import { splitCharges } from '../../features/insights';
import { TZ_TYPE_LABELS } from '../../features/parser/tz';
import { confidenceLabel } from '../../features/review/queue';
import {
  duplicateEditText,
  isDuplicateRecordError,
  totalOutOf,
  useAppStore,
  type Transaction,
} from '../../features/transactions';
import {
  buildRecordPatch,
  canConfirm,
  isRecordEditable,
  NO_RECORD_EDITS,
  recordEditViews,
  recordFields,
  type RecordEdits,
} from '../../features/transactions/editRecord';
import { colors, fonts, radius, space } from '../../theme';
import {
  isIncoming,
  isOutgoing,
  TYPE_LABELS,
  type MoneyCategory,
  type TransactionStatus,
  type TransactionType,
} from '../../types/domain';
import { formatTzs, MINUS } from '../../utils/format';
import { maskIdentifiersInText } from '../../utils/privacy';

const STATUS: Record<TransactionStatus, { label: string; tint: string; ink: string }> = {
  CONFIRMED: { label: 'Confirmed', tint: colors.accent2Ramp[300], ink: colors.accent2Ramp[900] },
  NEEDS_REVIEW: {
    label: 'Needs review',
    tint: colors.accentRamp[300],
    ink: colors.accentRamp[900],
  },
  // Saved without anyone checking it. "Parsed" means nothing to a person.
  PARSED: { label: 'Unconfirmed', tint: colors.neutralRamp[300], ink: colors.neutralRamp[800] },
  IGNORED: { label: 'Ignored', tint: colors.neutralRamp[300], ink: colors.neutralRamp[700] },
  FAILED: { label: 'Failed', tint: colors.accentRamp[300], ink: colors.accentRamp[900] },
};

// The design's small confidence ring.
const RING = 34;
const RADIUS = 13;
const STROKE = 5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type Busy = 'confirm' | 'save' | 'incorrect' | 'delete' | null;
type Source = { text: string; sender: string | null; imported: boolean } | null;

const leave = () => (router.canGoBack() ? router.back() : router.replace('/transactions'));

/**
 * One record: what was saved, how sure the parser was, the message it came
 * from, and the actions to confirm, correct, send back to review, or delete.
 */
export default function RecordDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const live = useAppStore((s) => s.transactions.find((t) => t.id === id) ?? null);
  const confirm = useAppStore((s) => s.confirm);
  const markIncorrect = useAppStore((s) => s.markIncorrect);
  const correct = useAppStore((s) => s.correct);
  const remove = useAppStore((s) => s.remove);
  const getRecordSource = useAppStore((s) => s.getRecordSource);
  const isFromOtherPhone = useAppStore((s) => s.isFromOtherPhone);

  // Held while deleting, so the screen does not flash "not found" as it leaves.
  const [frozen, setFrozen] = useState<Transaction | null>(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<RecordEdits>(NO_RECORD_EDITS);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  /** undefined while loading; null when the message is no longer stored. */
  const [source, setSource] = useState<Source | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  /** Arrived through sync: its SMS stays on the phone it was pasted on. */
  const [fromOtherPhone, setFromOtherPhone] = useState(false);

  const t = frozen ?? live;
  const sourceId = t?.sourceMessageId ?? null;
  const recordId = t?.id ?? null;

  useEffect(() => {
    if (!recordId) return;
    let alive = true;
    isFromOtherPhone(recordId)
      .then((yes) => {
        if (alive) setFromOtherPhone(yes);
      })
      .catch(() => {
        // Only changes wording; the record itself is unaffected.
      });
    return () => {
      alive = false;
    };
  }, [recordId, isFromOtherPhone]);

  useEffect(() => {
    let alive = true;
    getRecordSource(sourceId)
      .then((s) => {
        if (alive) setSource(s);
      })
      .catch(() => {
        if (alive) setSource(null);
      });
    return () => {
      alive = false;
    };
  }, [sourceId, getRecordSource]);

  if (!t) return <NotFound />;

  const incoming = isIncoming(t.type);
  const outgoing = isOutgoing(t.type);
  const hero =
    t.amount == null || (!incoming && !outgoing)
      ? { tint: colors.neutralRamp[200], ink: colors.neutralRamp[800] }
      : incoming
        ? { tint: colors.accent2Ramp[200], ink: colors.accent2Ramp[800] }
        : { tint: colors.accentRamp[200], ink: colors.accentRamp[800] };
  const sign = incoming ? '+ ' : outgoing ? `${MINUS} ` : '';
  const amountLabel = t.amount == null ? 'No amount' : `${sign}${formatTzs(t.amount)}`;
  const when = [t.transactionDate, t.transactionTime].filter(Boolean).join(' · ') || 'No date';
  const status = STATUS[t.status];
  // "74% overall · 1 to check" rather than a band that seems to contradict
  // the record still needing review.
  const confidence = confidenceLabel(t.confidence, t.lowFields.length, 'pct-first');
  const ringInk = confidence.needsCheck ? colors.accentRamp[500] : colors.accent2Ramp[600];

  const run = async (key: Exclude<Busy, null>, action: () => Promise<void>, done: () => void) => {
    setBusy(key);
    setError(null);
    try {
      await action();
      done();
    } catch (e) {
      setError(
        isDuplicateRecordError(e)
          ? duplicateEditText(e.existing)
          : 'That change could not be saved. Nothing was changed.',
      );
    } finally {
      setBusy(null);
    }
  };

  const startEditing = () => {
    setEdits(NO_RECORD_EDITS);
    setAskDelete(false);
    setEditing(true);
  };

  const onConfirm = () => {
    if (!canConfirm(t)) {
      setError('Add an amount before confirming.');
      startEditing();
      return;
    }
    void run(
      'confirm',
      () => confirm(t.id),
      () => toast('Confirmed.'),
    );
  };

  const onSave = () => {
    const built = buildRecordPatch(t, edits);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    if (built.editedKeys.length === 0) {
      setEditing(false);
      setError(null);
      return;
    }
    void run(
      'save',
      () => correct(t.id, built.patch, { rememberCategory: built.categoryChosen }),
      () => {
        setEditing(false);
        setEdits(NO_RECORD_EDITS);
        toast(
          built.categoryChosen && t.counterparty
            ? 'Saved and confirmed. Messages to this recipient will get the same category.'
            : 'Saved. The record is now confirmed.',
        );
      },
    );
  };

  const onDelete = async () => {
    setBusy('delete');
    setError(null);
    setFrozen(t);
    try {
      await remove(t.id);
      toast('Record and its message deleted.');
      leave();
    } catch {
      setFrozen(null);
      setBusy(null);
      setError('Could not delete this record. Nothing was changed.');
    }
  };

  const editText = (key: string, value: string) => {
    if (!isRecordEditable(key)) return;
    setEdits((e) => ({ ...e, text: { ...e.text, [key]: value } }));
  };
  const editType = (type: TransactionType) =>
    setEdits((e) => ({ ...e, type: type === t.type ? undefined : type }));
  const editCategory = (category: MoneyCategory) =>
    setEdits((e) => ({ ...e, moneyCategory: category }));

  const masked = source ? maskIdentifiersInText(source.text) : '';
  const hasHiddenNumbers = !!source && masked !== source.text;
  const origin = t.isDemo
    ? 'Demo sample'
    : fromOtherPhone
      ? 'Synced from another phone'
      : source?.imported
        ? 'Imported message'
        : 'Pasted message';
  const sender = source?.sender ?? 'unknown sender';

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
        <Text variant="h2" accessibilityRole="header" style={{ flex: 1 }}>
          {editing ? 'Edit transaction' : 'Transaction'}
        </Text>
      </View>

      <View
        accessible
        accessibilityLabel={`${TYPE_LABELS[t.type]}, ${status.label}.${t.isDemo ? '' : ' Parsed from SMS, not verified.'} ${amountLabel}. ${t.counterparty ?? 'No name'}, ${when}.`}
        style={{
          backgroundColor: hero.tint,
          borderRadius: radius.lg,
          padding: space[4],
          marginBottom: space[3],
          gap: space[2],
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Pill label={TYPE_LABELS[t.type]} tint={colors.surface} ink={hero.ink} />
          <Pill label={status.label} tint={status.tint} ink={status.ink} />
          {/* An SMS can be spoofed: read from the message, never "verified". */}
          {t.isDemo ? null : (
            <Pill label="Parsed from SMS" tint={colors.surface} ink={colors.neutralRamp[800]} />
          )}
        </View>
        <Text variant="display" style={{ color: hero.ink }}>
          {amountLabel}
        </Text>
        <Text variant="small" style={{ color: hero.ink, opacity: 0.85 }}>
          {t.counterparty ?? 'No name'} · {when}
        </Text>
      </View>

      <Card style={{ marginBottom: space[3] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[3],
            marginBottom: space[2],
          }}
          accessible
          accessibilityLabel={`Confidence ${confidence.text}.`}
        >
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <Svg width={RING} height={RING} viewBox={`0 0 ${RING} ${RING}`}>
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RADIUS}
                fill="none"
                stroke={colors.neutralRamp[300]}
                strokeWidth={STROKE}
              />
              <Circle
                cx={RING / 2}
                cy={RING / 2}
                r={RADIUS}
                fill="none"
                stroke={ringInk}
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
                strokeDashoffset={CIRCUMFERENCE * (1 - t.confidence)}
              />
            </Svg>
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" style={{ fontFamily: fonts.heading }}>
              {confidence.text}
            </Text>
            <Text variant="small" tone="muted">
              Confidence
            </Text>
          </View>
        </View>

        {editing
          ? recordEditViews(t, edits).map((field, i, all) => (
              <FieldRow
                key={field.key}
                field={field}
                editing
                type={edits.type ?? t.type}
                showConfidence={false}
                last={i === all.length - 1}
                onChangeText={(value) => editText(field.key, value)}
                onChangeType={editType}
                onChangeCategory={editCategory}
              />
            ))
          : [
              ...recordFields(t),
              ...(t.details.receipt
                ? [
                    {
                      key: 'receipt',
                      label: 'Receipt',
                      display: t.details.receipt,
                      low: false,
                      missing: false,
                    },
                  ]
                : []),
              ...(t.details.network
                ? [
                    {
                      key: 'network',
                      label: 'Sent to',
                      display: `${t.details.network}${t.details.merchant ? ' · Lipa merchant' : ''}`,
                      low: false,
                      missing: false,
                    },
                  ]
                : []),
              ...parsedRows(t),
              {
                key: 'source',
                label: 'Source',
                // The sender came with the SMS, which stayed on the other phone.
                display: fromOtherPhone ? origin : `${origin} · ${sender}`,
                low: false,
                missing: false,
              },
            ].map((field) => (
              <View
                key={field.key}
                accessible
                accessibilityLabel={`${field.label}: ${field.display}${field.low ? '. Unsure, worth checking.' : ''}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  gap: space[3],
                  paddingVertical: space[2],
                  borderTopWidth: 1,
                  borderTopColor: colors.divider,
                }}
              >
                <Text
                  variant="small"
                  style={{
                    width: '38%',
                    fontFamily: fonts.semibold,
                    color: colors.neutralRamp[700],
                  }}
                >
                  {field.label}
                </Text>
                <Text
                  variant="bodyMedium"
                  style={{
                    flex: 1,
                    fontFamily: fonts.semibold,
                    fontSize: 14,
                    color: field.missing ? colors.neutralRamp[700] : colors.text,
                  }}
                >
                  {field.display}
                </Text>
                {field.low ? (
                  <Icon name="caution" size={16} strokeWidth={3} color={colors.accentRamp[700]} />
                ) : null}
              </View>
            ))}
      </Card>

      {editing ? null : (
        <>
          <ChargesCard t={t} />
          <ElectricityCard t={t} />
        </>
      )}

      <View
        style={{
          backgroundColor: colors.neutralRamp[200],
          borderRadius: radius.lg,
          padding: space[4],
          marginBottom: space[4],
          gap: space[2],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="kicker" tone="muted" style={{ flex: 1 }}>
            Source message
          </Text>
          {source ? (
            <Pill
              label="Kept intact"
              tint={colors.accent2Ramp[200]}
              ink={colors.accent2Ramp[800]}
            />
          ) : null}
        </View>
        <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space[3] }}>
          <Text
            variant="mono"
            selectable
            style={{ fontSize: 11, lineHeight: 17, color: colors.neutralRamp[800] }}
          >
            {source === undefined
              ? 'Loading…'
              : source === null
                ? fromOtherPhone
                  ? 'Synced from another phone. The SMS stays on the phone it was pasted on.'
                  : 'The original message is no longer stored on this device.'
                : revealed
                  ? source.text
                  : masked}
          </Text>
        </View>
        {hasHiddenNumbers ? (
          <Button
            label={revealed ? 'Hide full numbers' : 'Show full numbers'}
            variant="ghost"
            onPress={() => setRevealed((r) => !r)}
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
      </View>

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

      {editing ? (
        <View style={{ gap: space[2] }}>
          <Button
            label="Save changes"
            size="lg"
            loading={busy === 'save'}
            disabled={busy !== null}
            onPress={onSave}
          />
          <Button
            label="Cancel"
            variant="ghost"
            disabled={busy !== null}
            onPress={() => {
              setEditing(false);
              setEdits(NO_RECORD_EDITS);
              setError(null);
            }}
          />
        </View>
      ) : askDelete ? (
        <Card
          elevation="none"
          style={{ backgroundColor: colors.accentRamp[100], gap: space[2] }}
          accessibilityLiveRegion="polite"
        >
          <Text variant="bodyMedium" style={{ fontFamily: fonts.heading }}>
            Delete this record?
          </Text>
          <Text variant="small" style={{ color: colors.accentRamp[900] }}>
            It is removed from this device together with its original message. This cannot be
            undone.
          </Text>
          <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
            <Button
              label="Delete permanently"
              variant="danger"
              loading={busy === 'delete'}
              disabled={busy !== null}
              onPress={() => void onDelete()}
              style={{ flex: 1 }}
            />
            <Button
              label="Keep it"
              variant="ghost"
              disabled={busy !== null}
              onPress={() => setAskDelete(false)}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : (
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {t.status !== 'CONFIRMED' ? (
              <Button
                label="Confirm"
                variant="positive"
                loading={busy === 'confirm'}
                disabled={busy !== null}
                onPress={onConfirm}
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              label="Edit"
              variant="secondary"
              disabled={busy !== null}
              onPress={startEditing}
              style={{ flex: 1 }}
            />
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {t.status !== 'NEEDS_REVIEW' ? (
              <Button
                label="Not correct"
                variant="secondary"
                loading={busy === 'incorrect'}
                disabled={busy !== null}
                onPress={() =>
                  void run(
                    'incorrect',
                    () => markIncorrect(t.id),
                    () => toast('Sent to the review queue.'),
                  )
                }
                style={{ flex: 1 }}
              />
            ) : null}
            <Button
              label="Delete"
              variant="ghost"
              disabled={busy !== null}
              left={<Icon name="trash" size={17} color={colors.accentRamp[700]} />}
              onPress={() => {
                setError(null);
                setAskDelete(true);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      )}
    </Screen>
  );
}

/** What the Tanzania mobile-money parser read beyond the core fields. */
function parsedRows(t: Transaction) {
  const d = t.details;
  const bank = [d.bankName, d.bankAccount].filter(Boolean).join(' · ');
  const rows: [string, string, string | null][] = [
    ['kind', 'Read as', d.kind ? TZ_TYPE_LABELS[d.kind] : null],
    ['billReference', 'Bill reference', d.billReference],
    ['paymentType', 'Payment type', d.paymentType],
    ['controlNumber', 'Control number', d.controlNumber],
    ['bank', 'Bank', bank || null],
  ];
  return rows.flatMap(([key, label, display]) =>
    display ? [{ key, label, display, low: false, missing: false }] : [],
  );
}

/**
 * What the record cost, as operator fees + taxes = fees & taxes, and what
 * left the balance (see features/insights/fees).
 */
function ChargesCard({ t }: { t: Transaction }) {
  const split = splitCharges([t]);
  const debt = t.details.debtCollected;
  if (split.total === 0 && debt == null) return null;

  return (
    <Card style={{ marginBottom: space[3], gap: space[1] }}>
      <Text variant="kicker" tone="muted" accessibilityRole="header">
        Fees & taxes
      </Text>
      <ChargesBreakdown split={split} />
      {isOutgoing(t.type) ? (
        <ChargeRow label="Total out" value={formatTzs(totalOutOf(t))} strong />
      ) : null}
      {debt != null ? (
        <ChargeRow label="Debt collected (not a tax)" value={formatTzs(debt)} />
      ) : null}
    </Card>
  );
}

/** A LUKU purchase: units, meter, and the token, hidden until asked for. */
function ElectricityCard({ t }: { t: Transaction }) {
  const [shown, setShown] = useState(false);
  const { units, meterNumber, token, netCost } = t.details;
  if (!units && !meterNumber && !token) return null;

  return (
    <Card style={{ marginBottom: space[3], gap: space[1] }}>
      <Text variant="kicker" tone="muted" accessibilityRole="header">
        Electricity (LUKU)
      </Text>
      {units ? <ChargeRow label="Units" value={units} /> : null}
      {netCost != null ? <ChargeRow label="Price before tax" value={formatTzs(netCost)} /> : null}
      {meterNumber ? <ChargeRow label="Meter" value={meterNumber} /> : null}
      {token ? (
        <View style={{ gap: space[1], marginTop: space[1] }}>
          <Text variant="small" tone="muted">
            Token
          </Text>
          <Text
            variant="mono"
            selectable={shown}
            accessibilityLabel={shown ? `Token ${token}` : 'Token hidden'}
            style={{ fontSize: 17, letterSpacing: 1, color: colors.text }}
          >
            {shown ? token : `•••• •••• •••• •••• ${token.slice(-4)}`}
          </Text>
          <Button
            label={shown ? 'Hide token' : 'Show token'}
            variant="ghost"
            onPress={() => setShown((s) => !s)}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
      ) : null}
    </Card>
  );
}

function ChargeRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: space[3],
        paddingVertical: 4,
      }}
    >
      <Text
        variant="small"
        style={{
          flex: 1,
          fontFamily: strong ? fonts.bold : fonts.semibold,
          color: strong ? colors.text : colors.neutralRamp[700],
        }}
      >
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={{ fontFamily: strong ? fonts.heading : fonts.semibold, fontSize: 14 }}
      >
        {value}
      </Text>
    </View>
  );
}

function Pill({ label, tint, ink }: { label: string; tint: string; ink: string }) {
  return (
    <View
      style={{
        backgroundColor: tint,
        borderRadius: radius.pill,
        paddingHorizontal: space[3],
        paddingVertical: space[1],
      }}
    >
      <Text variant="kicker" style={{ color: ink, fontFamily: fonts.bold }}>
        {label}
      </Text>
    </View>
  );
}

/** A stale link, or a record deleted elsewhere. */
function NotFound() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
        <Text variant="h2" accessibilityRole="header">
          Record not found
        </Text>
        <Text variant="body" tone="muted">
          It may have been deleted. Your other records are unaffected.
        </Text>
        <Button label="Back to records" onPress={() => router.replace('/transactions')} />
      </View>
    </Screen>
  );
}
