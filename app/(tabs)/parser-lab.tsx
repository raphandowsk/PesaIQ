import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Pressable, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { PIPELINE_STEPS, PipelineProgress } from '../../components/parser/PipelineProgress';
import { Button, Card, Icon, Screen, Tag, Text } from '../../components/ui';
import { useLabStore } from '../../features/lab/store';
import { MAX_MESSAGE_LENGTH, SAMPLES } from '../../features/parser';
import { colors, fonts, MIN_TOUCH, radius, shadow, space } from '../../theme';
import { formatAmount } from '../../utils/format';
import { useReduceMotion } from '../../utils/useReduceMotion';

/**
 * Pause per pipeline stage, from the design. The parse itself is instant; this
 * only paces the display of the stages it ran, and it is skipped entirely when
 * the OS asks for reduced motion.
 */
const STEP_MS = 400;

const SAMPLE_TINTS = [
  { tint: colors.accent2Ramp[200], ink: colors.accent2Ramp[800] },
  { tint: colors.accentRamp[200], ink: colors.accentRamp[800] },
  { tint: colors.neutralRamp[300], ink: colors.neutralRamp[800] },
];

const SAMPLE_BADGE = 32;
const INPUT_MIN_HEIGHT = 150;

export default function ParserLab() {
  const text = useLabStore((s) => s.text);
  const error = useLabStore((s) => s.error);
  const setText = useLabStore((s) => s.setText);
  const loadSample = useLabStore((s) => s.loadSample);
  const clear = useLabStore((s) => s.clear);
  const analyze = useLabStore((s) => s.analyze);
  const reduceMotion = useReduceMotion();

  /** Stages finished so far; null when not analyzing. */
  const [completed, setCompleted] = useState<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const analyzing = completed !== null;

  const cancel = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setCompleted(null);
  }, []);

  // Leaving the tab mid-animation must not pull the user to the result later.
  useFocusEffect(useCallback(() => cancel, [cancel]));
  useEffect(() => cancel, [cancel]);

  const run = () => {
    if (analyzing) return;
    Keyboard.dismiss();
    if (!analyze()) return;

    if (reduceMotion) {
      router.push('/result');
      return;
    }

    setCompleted(0);
    PIPELINE_STEPS.forEach((_, i) => {
      const last = i === PIPELINE_STEPS.length - 1;
      timers.current.push(
        setTimeout(
          () => {
            if (!last) {
              setCompleted(i + 1);
              return;
            }
            timers.current = [];
            setCompleted(null);
            router.push('/result');
          },
          STEP_MS * (i + 1),
        ),
      );
    });
  };

  const overLimit = text.trim().length > MAX_MESSAGE_LENGTH;

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[4], marginBottom: space[4], gap: 2 }}>
        <Text variant="h2" accessibilityRole="header">
          Parser Lab
        </Text>
        <Text variant="small" tone="muted">
          Paste a message to analyze
        </Text>
      </View>

      <Card style={{ padding: space[3], marginBottom: space[3] }}>
        <TextInput
          multiline
          value={text}
          onChangeText={setText}
          editable={!analyzing}
          placeholder="Paste an SMS here…"
          placeholderTextColor={colors.neutralRamp[700]}
          accessibilityLabel="Message to analyze"
          autoCorrect={false}
          autoCapitalize="none"
          style={{
            minHeight: INPUT_MIN_HEIGHT,
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
        <View
          style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <Text
            variant="small"
            tone={overLimit ? 'accent' : 'muted'}
            style={{ fontSize: 11 }}
            accessibilityLabel={`${text.length} characters${overLimit ? ', over the limit' : ''}`}
          >
            {formatAmount(text.length)} characters
          </Text>
          <Pressable
            onPress={clear}
            disabled={!text || analyzing}
            accessibilityRole="button"
            accessibilityLabel="Clear message"
            style={{
              minHeight: MIN_TOUCH,
              paddingHorizontal: space[3],
              justifyContent: 'center',
              opacity: !text || analyzing ? 0.45 : 1,
            }}
          >
            <Text
              variant="small"
              style={{ fontFamily: fonts.bold, color: colors.neutralRamp[700] }}
            >
              Clear
            </Text>
          </Pressable>
        </View>
      </Card>

      {error ? (
        <View
          accessibilityLiveRegion="polite"
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: space[3],
            backgroundColor: colors.accentRamp[200],
            borderRadius: radius.md,
            padding: space[3],
            marginBottom: space[3],
          }}
        >
          <Icon name="warning" color={colors.accentRamp[800]} />
          <Text variant="small" style={{ flex: 1, color: colors.accentRamp[900] }}>
            {error}
          </Text>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          marginBottom: space[2],
        }}
      >
        <Text variant="kicker" tone="muted">
          Sample messages
        </Text>
        <Tag label="Demo · anonymized" tone="positive" />
      </View>

      <View style={{ gap: space[2], marginBottom: space[4] }}>
        {SAMPLES.map((sample, i) => {
          const tone = SAMPLE_TINTS[i % SAMPLE_TINTS.length];
          return (
            <Pressable
              key={sample.id}
              onPress={() => loadSample(sample)}
              disabled={analyzing}
              accessibilityRole="button"
              accessibilityLabel={`Load sample: ${sample.name}. ${sample.hint}`}
              style={({ pressed }) => ({
                minHeight: MIN_TOUCH,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                borderWidth: 1,
                borderColor: colors.neutralRamp[300],
                backgroundColor: pressed ? colors.accentRamp[100] : colors.surface,
                borderRadius: radius.md,
                padding: space[3],
              })}
            >
              <View
                style={{
                  width: SAMPLE_BADGE,
                  height: SAMPLE_BADGE,
                  borderRadius: radius.sm,
                  backgroundColor: tone.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="small" style={{ fontFamily: fonts.heading, color: tone.ink }}>
                  {sample.badge}
                </Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="small" style={{ fontFamily: fonts.bold }}>
                  {sample.name}
                </Text>
                <Text variant="small" tone="muted" numberOfLines={1} style={{ fontSize: 11 }}>
                  {sample.hint}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <Button
        label="Analyze message"
        size="lg"
        onPress={run}
        disabled={analyzing}
        style={shadow.md}
      />

      {completed !== null ? (
        <View style={{ marginTop: space[4] }}>
          <PipelineProgress completed={completed} />
        </View>
      ) : null}
    </Screen>
  );
}
