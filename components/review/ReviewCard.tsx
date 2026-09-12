import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useAppStore, type Transaction } from '../../features/transactions';
import {
  buildRecordPatch,
  NO_RECORD_EDITS,
  recordValue,
  type RecordEditableKey,
  type RecordEdits,
} from '../../features/transactions/editRecord';
import { reviewFields, reviewTypeOptions } from '../../features/review/queue';
import { colors, fonts, MIN_TOUCH, money, radius, space } from '../../theme';
import { isIncoming, isOutgoing, TYPE_LABELS, type TransactionType } from '../../types/domain';
import { formatAmount, initials } from '../../utils/format';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { toast } from '../ui/Toast';

const FIELD_META: Record<
  RecordEditableKey,
  { label: string; placeholder: string; numeric?: boolean; caps?: 'none' | 'words' | 'characters' }
> = {
  amount: { label: 'Amount (TZS)', placeholder: 'e.g. 45,000', numeric: true },
  counterparty: {
    label: 'Counterparty',
    placeholder: 'Sender or recipient name',
    caps: 'characters',
  },
  reference: { label: 'Reference', placeholder: 'e.g. QH42T8LM9P', caps: 'characters' },
  provider: { label: 'Provider', placeholder: 'e.g. M-Pesa', caps: 'words' },
  balance: { label: 'Balance after (TZS)', placeholder: 'e.g. 133,900', numeric: true },
  date: { label: 'Date', placeholder: 'e.g. 12 Mar 2026', caps: 'none' },
};

const TILE = 38;
const TILE_RADIUS = 14;
const IGNORE_WIDTH = 96;

type Busy = 'save' | 'ignore' | null;

/**
 * One record in the review queue: what the parser found, the fields it was
 * unsure about as inputs, and Save & confirm / Ignore.
 *
 * Saving uses the same rules as the detail screen's editor (buildRecordPatch):
 * only real changes count, money reads the same everywhere, and an amount is
 * required. With nothing changed it simply confirms.
 */
export function ReviewCard({
  transaction: t,
  onOpen,
}: {
  transaction: Transaction;
  onOpen: () => void;
}) {
  const confirm = useAppStore((s) => s.confirm);
  const correct = useAppStore((s) => s.correct);
  const ignore = useAppStore((s) => s.ignore);

  const [edits, setEdits] = useState<RecordEdits>(NO_RECORD_EDITS);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const incoming = isIncoming(t.type);
  const outgoing = isOutgoing(t.type);
  const tone =
    t.amount == null || (!incoming && !outgoing) ? money.none : incoming ? money.in : money.out;
  const amountLabel = t.amount == null ? 'No amount' : `TZS ${formatAmount(t.amount)}`;
  const sub = `${t.provider ?? 'Unrecognized sender'} · ${t.transactionDate ?? 'no date'}`;
  const pct = Math.round(t.confidence * 100);
  const type = edits.type ?? t.type;
  const typeFlagged = t.lowFields.includes('category') && !edits.type;

  const setText = (key: RecordEditableKey, value: string) => {
    setError(null);
    setEdits((e) => ({ ...e, text: { ...e.text, [key]: value } }));
  };

  const setType = (next: TransactionType) => {
    setError(null);
    setEdits((e) => ({ ...e, type: next === t.type ? undefined : next }));
  };

  const onSave = async () => {
    const built = buildRecordPatch(t, edits);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setBusy('save');
    setError(null);
    try {
      if (built.editedKeys.length === 0) {
        await confirm(t.id);
        toast('Confirmed.');
      } else {
        await correct(t.id, built.patch);
        toast('Confirmed, with your corrections saved.');
      }
    } catch {
      setError('That change could not be saved. Nothing was changed.');
      setBusy(null);
    }
  };

  const onIgnore = async () => {
    setBusy('ignore');
    setError(null);
    try {
      await ignore(t.id);
      toast('Ignored. It stays in Records but no longer counts in your totals.');
    } catch {
      setError('That change could not be saved. Nothing was changed.');
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: space[3] }}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open record: ${amountLabel}, ${sub}. ${pct}% confidence.`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <View
          style={{
            width: TILE,
            height: TILE,
            borderRadius: TILE_RADIUS,
            backgroundColor: tone.tint,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="small" style={{ fontFamily: fonts.heading, color: tone.ink }}>
            {initials(t.counterparty)}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="bodyMedium"
            style={{ fontFamily: fonts.heading, fontSize: 17, lineHeight: 21 }}
          >
            {amountLabel}
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View
          style={{
            backgroundColor: colors.accentRamp[200],
            borderRadius: radius.pill,
            paddingHorizontal: space[2],
            paddingVertical: space[1],
          }}
        >
          <Text variant="kicker" style={{ fontSize: 10, color: colors.accentRamp[800] }}>
            {pct}% conf
          </Text>
        </View>
      </Pressable>

      <View style={{ gap: space[2] }}>
        <FieldLabel label="Type" flagged={typeFlagged} />
        <View
          accessibilityRole="radiogroup"
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
        >
          {reviewTypeOptions(t.type).map((option) => {
            const on = option === type;
            return (
              <Pressable
                key={option}
                onPress={() => setType(option)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                aria-checked={on}
                accessibilityLabel={TYPE_LABELS[option]}
                style={({ pressed }) => ({
                  minHeight: MIN_TOUCH,
                  paddingHorizontal: space[3],
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  justifyContent: 'center',
                  borderColor: on ? colors.accent2Ramp[500] : colors.neutralRamp[300],
                  backgroundColor: on
                    ? colors.accent2Ramp[500]
                    : pressed
                      ? colors.neutralRamp[200]
                      : 'transparent',
                })}
              >
                <Text
                  variant="small"
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 12,
                    // White on lime-500 is 1.9:1; the darkest lime reads at 6.2:1.
                    color: on ? colors.accent2Ramp[900] : colors.neutralRamp[800],
                  }}
                >
                  {TYPE_LABELS[option]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {reviewFields(t).map((key) => {
        const meta = FIELD_META[key];
        const typed = edits.text[key];
        const value = typed ?? recordValue(t, key);
        const flagged = t.lowFields.includes(key) && typed === undefined;
        return (
          <View key={key} style={{ gap: space[1] }}>
            <FieldLabel label={meta.label} flagged={flagged} />
            <TextInput
              value={value}
              onChangeText={(v) => setText(key, v)}
              placeholder={meta.placeholder}
              placeholderTextColor={colors.neutralRamp[700]}
              accessibilityLabel={flagged ? `${meta.label}, unsure, worth checking` : meta.label}
              keyboardType={meta.numeric ? 'decimal-pad' : 'default'}
              autoCapitalize={meta.caps ?? 'none'}
              autoCorrect={false}
              style={{
                minHeight: MIN_TOUCH,
                borderWidth: 1,
                borderColor: flagged ? colors.accentRamp[400] : colors.neutralRamp[300],
                borderRadius: radius.pill,
                backgroundColor: colors.bg,
                paddingHorizontal: space[4],
                fontFamily: fonts.semibold,
                fontSize: 14,
                color: colors.text,
              }}
            />
          </View>
        );
      })}

      {error ? (
        <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
        <Button
          label="Save & confirm"
          accessibilityLabel={`Save and confirm: ${amountLabel}`}
          variant="positive"
          loading={busy === 'save'}
          disabled={busy !== null}
          onPress={() => void onSave()}
          style={{ flex: 1 }}
        />
        <Button
          label="Ignore"
          accessibilityLabel={`Ignore: ${amountLabel}`}
          variant="secondary"
          loading={busy === 'ignore'}
          disabled={busy !== null}
          onPress={() => void onIgnore()}
          style={{ width: IGNORE_WIDTH }}
        />
      </View>
    </Card>
  );
}

function FieldLabel({ label, flagged }: { label: string; flagged: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
      <Text variant="kicker" tone="muted">
        {label}
      </Text>
      {flagged ? (
        <Icon name="caution" size={13} strokeWidth={3} color={colors.accentRamp[700]} />
      ) : null}
    </View>
  );
}
