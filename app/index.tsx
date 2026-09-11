import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button, Card, Screen, Tag, Text } from '../components/ui';
import { parseMessage, SAMPLES, type ParseResult, type SmsSample } from '../features/parser';
import { colors, money, radius, space } from '../theme';

/**
 * Phase 1B check: a working paste -> analyze -> result loop.
 *
 * This is deliberately plain — it proves the engine end to end in Expo Go.
 * Phase 1E replaces it with the designed Parser Lab, and Phase 1D puts
 * onboarding and the tab bar in front of it.
 */
export default function ParserCheck() {
  const [text, setText] = useState('');
  const [sender, setSender] = useState<string | undefined>();
  const [result, setResult] = useState<ParseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSample = (s: SmsSample) => {
    setText(s.text);
    setSender(s.sender);
    setResult(null);
    setError(null);
  };

  const analyze = () => {
    try {
      setResult(parseMessage(text, { sender }));
      setError(null);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Could not analyze that message.');
    }
  };

  const tint = useMemo(() => {
    if (!result || result.amount == null) return money.none;
    return result.type === 'RECEIVED' || result.type === 'DEPOSIT' ? money.in : money.out;
  }, [result]);

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="kicker" tone="accent">
          PesaIQ · Stage 1 · Phase 1B
        </Text>
        <Text variant="display">Parser Lab</Text>
        <Text variant="body" tone="muted">
          Paste a message, or load one of the anonymized demo samples.
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
              label={`${s.badge} · ${s.name}`}
              variant="secondary"
              onPress={() => loadSample(s)}
            />
          ))}
        </View>
      </Card>

      <Card style={{ marginTop: space[3], gap: space[3] }}>
        <Text variant="kicker" tone="muted">
          Message
        </Text>
        <TextInput
          multiline
          value={text}
          onChangeText={(t) => {
            setText(t);
            setError(null);
          }}
          placeholder="Paste an SMS here"
          placeholderTextColor={colors.neutralRamp[500]}
          accessibilityLabel="Message to analyze"
          style={{
            minHeight: 120,
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
        <Text variant="small" tone="faint">
          {text.length} characters
        </Text>

        {error ? (
          <Text variant="small" tone="accent">
            {error}
          </Text>
        ) : null}

        <Button label="Analyze message" onPress={analyze} block />
      </Card>

      {result ? (
        <Card style={{ marginTop: space[3], gap: space[3] }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text variant="kicker" tone="muted">
              Result
            </Text>
            <Tag
              label={`${result.band} · ${Math.round(result.confidence * 100)}%`}
              tone={result.confidence >= 0.8 ? 'positive' : 'accent'}
            />
          </View>

          <View style={{ backgroundColor: tint.tint, borderRadius: radius.md, padding: space[3] }}>
            <Text variant="kicker" style={{ color: tint.ink }}>
              {result.category.replace(/_/g, ' ')}
            </Text>
            <Text variant="amount" style={{ color: tint.amount }}>
              {result.amount == null
                ? 'No amount'
                : `${result.type === 'RECEIVED' || result.type === 'DEPOSIT' ? '+' : '−'} TZS ${result.amount.toLocaleString('en-US')}`}
            </Text>
            <Text variant="small" style={{ color: tint.ink }}>
              {result.counterparty ?? 'No counterparty'} ·{' '}
              {result.provider ?? 'sender not recognized'}
            </Text>
          </View>

          {result.fields.map((f) => (
            <View
              key={f.key}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: space[3],
              }}
            >
              <Text variant="small" tone="muted" style={{ flex: 1 }}>
                {f.label}
              </Text>
              <Text
                variant="smallMedium"
                tone={f.missing ? 'faint' : f.low ? 'accent' : 'default'}
                style={{ flex: 1, textAlign: 'right' }}
              >
                {f.display}
                {f.low ? '  ⚠' : ''}
              </Text>
            </View>
          ))}

          {result.warnings.length > 0 ? (
            <View style={{ gap: space[1] }}>
              <Text variant="kicker" tone="accent">
                Warnings
              </Text>
              {result.warnings.map((w) => (
                <Text key={w} variant="small" tone="accent">
                  · {w}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={{ gap: space[1] }}>
            <Text variant="kicker" tone="muted">
              Why
            </Text>
            {result.reasons.map((r) => (
              <Text key={r} variant="small" tone="muted">
                ✓ {r}
              </Text>
            ))}
          </View>

          <Text variant="small" tone="faint">
            {result.parserId} · rules only, no AI. Low-confidence fields are never treated as
            verified.
          </Text>
        </Card>
      ) : null}
    </Screen>
  );
}
