import { useEffect, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';

import { Button, Card, Screen, Tag, Text } from '../components/ui';
import { SAMPLES, type ParseResult, type SmsSample } from '../features/parser';
import { useAppStore } from '../features/transactions';
import { colors, money, radius, space } from '../theme';
import { isIncoming, TYPE_LABELS } from '../types/domain';

/**
 * Phase 1C check: the full paste -> analyze -> save -> list loop, on SQLite.
 *
 * Still deliberately plain. Phase 1D puts onboarding and the tab bar in front
 * of this, and Phase 1E replaces it with the designed Parser Lab.
 */
export default function DataLayerCheck() {
  const { ready, error, transactions, settings, initialize, analyzeAndSave, confirm, remove } =
    useAppStore();

  const [text, setText] = useState('');
  const [sender, setSender] = useState<string | undefined>();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const loadSample = (s: SmsSample) => {
    setText(s.text);
    setSender(s.sender);
    setResult(null);
    setNotice(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const outcome = await analyzeAndSave(text, sender);
      setResult(null);
      setText('');
      setSender(undefined);
      setNotice(
        outcome.duplicateOf
          ? `Saved, but reference ${outcome.transaction.transactionReference} already exists.`
          : outcome.transaction.status === 'NEEDS_REVIEW'
            ? 'Saved to the review queue.'
            : 'Transaction saved.',
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Could not save that message.');
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
          {error ? (
            <>
              <Text variant="h3">Could not open the database</Text>
              <Text variant="small" tone="muted">
                {error}
              </Text>
              <Button label="Try again" onPress={() => void initialize()} />
            </>
          ) : (
            <>
              <ActivityIndicator color={colors.accent} />
              <Text variant="small" tone="muted">
                Opening PesaIQ
              </Text>
            </>
          )}
        </View>
      </Screen>
    );
  }

  const reviewCount = transactions.filter((t) => t.status === 'NEEDS_REVIEW').length;

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="kicker" tone="accent">
          PesaIQ · Stage 1 · Phase 1C
        </Text>
        <Text variant="display">Records</Text>
        <Text variant="body" tone="muted">
          {transactions.length} saved · {reviewCount} need review
          {settings.demoDataEnabled ? ' · demo data on' : ''}
        </Text>
      </View>

      <Card style={{ marginTop: space[6], gap: space[3] }}>
        <Text variant="kicker" tone="muted">
          Sample messages · demo, anonymized
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {SAMPLES.map((s) => (
            <Button
              key={s.id}
              label={s.badge}
              variant="secondary"
              onPress={() => loadSample(s)}
              accessibilityLabel={`Load sample: ${s.name}`}
            />
          ))}
        </View>

        <TextInput
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            setNotice(null);
          }}
          placeholder="Paste an SMS here"
          placeholderTextColor={colors.neutralRamp[500]}
          accessibilityLabel="Message to analyze"
          style={{
            minHeight: 110,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.neutralRamp[300],
            backgroundColor: colors.bg,
            padding: space[3],
            color: colors.text,
            fontFamily: 'PlusJakartaSans_400Regular',
            fontSize: 14,
            textAlignVertical: 'top',
          }}
        />

        {notice ? (
          <Text variant="small" tone="accent">
            {notice}
          </Text>
        ) : null}

        <Button label="Analyze and save" onPress={() => void save()} loading={busy} block />
      </Card>

      {result ? (
        <Card style={{ marginTop: space[3] }}>
          <Text variant="small">{result.category}</Text>
        </Card>
      ) : null}

      <View style={{ marginTop: space[6], gap: space[2] }}>
        <Text variant="kicker" tone="muted">
          Saved records
        </Text>

        {transactions.length === 0 ? (
          <Card>
            <Text variant="h3">Nothing here yet</Text>
            <Text variant="small" tone="muted">
              Paste a message above to create your first record.
            </Text>
          </Card>
        ) : null}

        {transactions.map((t) => {
          const tint = t.amount == null ? money.none : isIncoming(t.type) ? money.in : money.out;

          return (
            <Card key={t.id} style={{ gap: space[2] }}>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: space[3],
                }}
              >
                <View style={{ flex: 1, gap: space[1] }}>
                  <Text variant="h3">{t.counterparty ?? 'No name'}</Text>
                  <Text variant="small" tone="muted">
                    {TYPE_LABELS[t.type]} · {t.provider ?? 'unrecognized sender'}
                  </Text>
                  <Text variant="small" tone="faint">
                    {t.transactionDate ?? 'no date'} · {t.maskedAccountOrPhone ?? 'no number'} ·{' '}
                    {t.transactionReference ?? 'no reference'}
                  </Text>
                </View>

                <View style={{ alignItems: 'flex-end', gap: space[1] }}>
                  <Text variant="bodyMedium" style={{ color: tint.amount }}>
                    {t.amount == null
                      ? '—'
                      : `${isIncoming(t.type) ? '+' : '−'} ${t.amount.toLocaleString('en-US')}`}
                  </Text>
                  <Text variant="small" tone="faint">
                    {Math.round(t.confidence * 100)}%
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
                {t.status === 'NEEDS_REVIEW' ? <Tag label="Needs review" tone="accent" /> : null}
                {t.status === 'CONFIRMED' ? <Tag label="Confirmed" tone="positive" /> : null}
                {t.isDemo ? <Tag label="Demo" tone="neutral" /> : null}
              </View>

              <View style={{ flexDirection: 'row', gap: space[2] }}>
                {t.status !== 'CONFIRMED' ? (
                  <Button
                    label="Confirm"
                    variant="secondary"
                    onPress={() => void confirm(t.id)}
                    accessibilityLabel={`Confirm record for ${t.counterparty ?? 'unnamed'}`}
                  />
                ) : null}
                <Button
                  label="Delete"
                  variant="danger"
                  onPress={() => void remove(t.id)}
                  accessibilityLabel={`Delete record for ${t.counterparty ?? 'unnamed'}`}
                />
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
