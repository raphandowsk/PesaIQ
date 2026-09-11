import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Screen, Tag, Text } from '../../components/ui';
import { SAMPLES, type SmsSample } from '../../features/parser';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, radius, space } from '../../theme';

/**
 * Interim Parser Lab: paste -> analyze -> save, on the real engine and SQLite.
 * The designed Lab — pipeline, result card, per-field edit — arrives in 1E.
 */
export default function ParserLab() {
  const analyzeAndSave = useAppStore((s) => s.analyzeAndSave);

  const [text, setText] = useState('');
  const [sender, setSender] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSample = (s: SmsSample) => {
    setText(s.text);
    setSender(s.sender);
    setNotice(null);
  };

  const save = async () => {
    setBusy(true);
    try {
      const outcome = await analyzeAndSave(text, sender);
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

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="title">Parser Lab</Text>
        <Text variant="body" tone="muted">
          Paste a message
        </Text>
        <Tag label="Preview · designed Lab in 1E" tone="neutral" />
      </View>

      <Card style={{ marginTop: space[4], gap: space[3] }}>
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
            fontFamily: fonts.regular,
            fontSize: 14,
            textAlignVertical: 'top',
          }}
        />

        <Text variant="small" tone="faint">
          {text.length} characters
        </Text>

        {notice ? (
          <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}

        <Button label="Analyze and save" size="lg" onPress={() => void save()} loading={busy} />
      </Card>
    </Screen>
  );
}
