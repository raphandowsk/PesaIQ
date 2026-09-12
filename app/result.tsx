import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { FieldRow } from '../components/parser/FieldRow';
import { HowWeGotThis } from '../components/parser/HowWeGotThis';
import { BackButton } from '../components/ui/BackButton';
import { Button, Card, Screen, Text, toast } from '../components/ui';
import { isTextEditable, viewDraft, type DraftEdits } from '../features/lab/draft';
import { useLabStore } from '../features/lab/store';
import { confidenceLabel } from '../features/review/queue';
import type { ParseResult } from '../features/parser';
import { colors, fonts, radius, shadow, space } from '../theme';
import { TYPE_LABELS } from '../types/domain';
import { formatTzs, MINUS } from '../utils/format';

type Snapshot = { draft: ParseResult; edits: DraftEdits };
type Busy = 'save' | 'reject' | null;

const leave = () => (router.canGoBack() ? router.back() : router.replace('/parser-lab'));

/**
 * The analysis result: what the parser extracted, how sure it is about each
 * field, why — and the user's chance to correct it before it is saved.
 */
export default function Result() {
  const draft = useLabStore((s) => s.draft);
  const edits = useLabStore((s) => s.edits);
  const editing = useLabStore((s) => s.editing);
  const setEditing = useLabStore((s) => s.setEditing);
  const editField = useLabStore((s) => s.editField);
  const setType = useLabStore((s) => s.setType);
  const setMoneyCategory = useLabStore((s) => s.setMoneyCategory);
  const save = useLabStore((s) => s.save);
  const reject = useLabStore((s) => s.reject);
  const discard = useLabStore((s) => s.discard);

  const [why, setWhy] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  // Save, reject and discard clear the draft while this screen is still
  // animating away. Freezing what was on screen stops it flashing empty.
  const [frozen, setFrozen] = useState<Snapshot | null>(null);

  const current: Snapshot | null = frozen ?? (draft ? { draft, edits } : null);
  if (!current) return <NothingToShow />;

  const view = viewDraft(current.draft, current.edits);

  const onSave = async () => {
    if (!draft) return;
    setBusy('save');
    setError(null);
    setFrozen({ draft, edits });

    const result = await save();
    if (!result.ok) {
      setFrozen(null);
      setBusy(null);
      setError(result.error);
      // Most failures are a missing or mistyped value; open the fields to fix it.
      setEditing(true);
      return;
    }

    const { transaction, duplicateOf } = result.outcome;
    toast(
      duplicateOf
        ? `Saved. Reference ${transaction.transactionReference} was already on record.`
        : transaction.status === 'NEEDS_REVIEW'
          ? 'Saved to the review queue.'
          : 'Transaction saved.',
    );
    router.dismissTo('/dashboard');
  };

  const onReject = async () => {
    if (!draft) return;
    setBusy('reject');
    setFrozen({ draft, edits });
    await reject();
    toast('Marked not correct. Nothing was saved.');
    leave();
  };

  const onDiscard = () => {
    if (draft) setFrozen({ draft, edits });
    discard();
    leave();
  };

  const hero =
    view.amount == null || view.direction === 'none'
      ? { tint: colors.neutralRamp[200], ink: colors.neutralRamp[800] }
      : view.direction === 'in'
        ? { tint: colors.accent2Ramp[200], ink: colors.accent2Ramp[900] }
        : { tint: colors.accentRamp[200], ink: colors.accentRamp[900] };
  // A record can score "Very high" overall and still have a field worth
  // checking; the pill says so rather than reading as a contradiction.
  const confidence = confidenceLabel(view.confidence, view.remainingLow.length, 'band-first');
  const bandTone = confidence.needsCheck
    ? { tint: colors.accentRamp[300], ink: colors.accentRamp[900] }
    : { tint: colors.accent2Ramp[300], ink: colors.accent2Ramp[900] };

  const sign = view.direction === 'in' ? '+ ' : view.direction === 'out' ? `${MINUS} ` : '';
  const amountLabel = view.amount == null ? 'No amount' : `${sign}${formatTzs(view.amount)}`;
  const categoryLabel = current.edits.type
    ? TYPE_LABELS[view.type]
    : current.draft.category.replace(/_/g, ' ');
  const subLabel = `${view.counterparty ?? 'No counterparty'} · ${view.provider ?? 'sender not recognized'}`;

  // The same arithmetic a saved record uses: spent + fees and taxes = total out.
  const taxesWithin = (within: 'amount' | 'extra') =>
    current.draft.taxes.filter((t) => t.within === within).reduce((sum, t) => sum + t.amount, 0);
  const charges = (view.fee ?? 0) + taxesWithin('extra') + taxesWithin('amount');
  const totalOut = (view.amount ?? 0) + (view.fee ?? 0) + taxesWithin('extra');
  const chargesLabel =
    charges > 0
      ? `Fees & taxes ${formatTzs(charges)}${view.direction === 'out' ? ` · Total out ${formatTzs(totalOut)}` : ''}`
      : null;

  const saveLabel = editing
    ? 'Save edits'
    : view.willNeedReview
      ? 'Save to review'
      : 'Confirm & save';

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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="h2" accessibilityRole="header">
            Result
          </Text>
          <Text variant="small" tone="muted" numberOfLines={1}>
            {current.draft.parserId}
          </Text>
        </View>
        <Button
          label={editing ? 'Done' : 'Edit'}
          variant="secondary"
          disabled={busy !== null}
          onPress={() => setEditing(!editing)}
        />
      </View>

      <View
        accessible
        accessibilityLabel={`${categoryLabel}. Confidence ${confidence.text}. ${amountLabel}. ${subLabel}.${chargesLabel ? ` ${chargesLabel}.` : ''}`}
        style={{
          backgroundColor: hero.tint,
          borderRadius: radius.lg,
          padding: space[4],
          marginBottom: space[3],
          gap: space[2],
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          <Pill label={categoryLabel} tint={colors.surface} ink={hero.ink} />
          <Pill label={confidence.text} tint={bandTone.tint} ink={bandTone.ink} />
        </View>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit style={{ color: hero.ink }}>
          {amountLabel}
        </Text>
        <Text variant="small" style={{ color: hero.ink, opacity: 0.85 }}>
          {subLabel}
        </Text>
        {chargesLabel ? (
          <Text variant="small" style={{ color: hero.ink, fontFamily: fonts.semibold }}>
            {chargesLabel}
          </Text>
        ) : null}
      </View>

      {current.draft.warnings.length > 0 ? (
        <View
          style={{
            backgroundColor: colors.accentRamp[200],
            borderRadius: radius.md,
            padding: space[3],
            marginBottom: space[3],
            gap: space[1],
          }}
        >
          <Text variant="kicker" style={{ color: colors.accentRamp[800] }}>
            Warnings
          </Text>
          {current.draft.warnings.map((warning) => (
            <Text key={warning} variant="small" style={{ color: colors.accentRamp[900] }}>
              · {warning}
            </Text>
          ))}
        </View>
      ) : null}

      <Card style={{ paddingVertical: space[1], marginBottom: space[3] }}>
        {view.fields.map((field, i) => (
          <FieldRow
            key={field.key}
            field={field}
            editing={editing}
            type={view.type}
            last={i === view.fields.length - 1}
            onChangeText={(value) => {
              if (isTextEditable(field.key)) editField(field.key, value);
            }}
            onChangeType={setType}
            onChangeCategory={setMoneyCategory}
          />
        ))}
      </Card>

      <HowWeGotThis result={current.draft} expanded={why} onToggle={() => setWhy(!why)} />

      {error ? (
        <Text
          variant="small"
          tone="accent"
          style={{ marginTop: space[4] }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}

      <View style={{ gap: space[2], marginTop: space[4] }}>
        <Button
          label={saveLabel}
          size="lg"
          loading={busy === 'save'}
          disabled={busy !== null}
          onPress={() => void onSave()}
          style={shadow.md}
        />
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button
            label="Not correct"
            variant="secondary"
            loading={busy === 'reject'}
            disabled={busy !== null}
            onPress={() => void onReject()}
            style={{ flex: 1 }}
          />
          <Button
            label="Discard"
            variant="ghost"
            disabled={busy !== null}
            onPress={onDiscard}
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Screen>
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

/** Reached only by a deep link or after the app was restarted on this screen. */
function NothingToShow() {
  return (
    <Screen edges={['top', 'bottom', 'left', 'right']}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
        <Text variant="h2" accessibilityRole="header">
          Nothing to show
        </Text>
        <Text variant="body" tone="muted">
          Analyze a message in the Parser Lab to see its result here.
        </Text>
        <Button label="Open the Lab" onPress={() => router.replace('/parser-lab')} />
      </View>
    </Screen>
  );
}
