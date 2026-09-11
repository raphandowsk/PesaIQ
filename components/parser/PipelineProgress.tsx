import { ActivityIndicator, View } from 'react-native';

import { colors, fonts, radius, space } from '../../theme';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/**
 * The four stages the engine runs, in order. Wording follows the design,
 * except the first: the design says "whitespace and case", but the normalizer
 * deliberately keeps the original case (the classifier matches
 * case-insensitively instead), so the label says only what actually happens.
 */
export const PIPELINE_STEPS = [
  'Normalize whitespace',
  'Classify the message',
  'Extract fields',
  'Score confidence',
] as const;

const DOT = 24;

/** `completed` counts finished stages, 0-4; the next one reads as current. */
export function PipelineProgress({ completed }: { completed: number }) {
  const current = Math.min(completed + 1, PIPELINE_STEPS.length);

  return (
    <Card
      style={{ gap: space[3] }}
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel={`Analyzing, step ${current} of ${PIPELINE_STEPS.length}: ${PIPELINE_STEPS[current - 1]}`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text variant="bodyMedium" style={{ fontFamily: fonts.heading }}>
          Analyzing…
        </Text>
      </View>

      <View style={{ gap: space[2] }}>
        {PIPELINE_STEPS.map((label, i) => {
          const done = completed > i;
          const active = completed === i;
          return (
            <View
              key={label}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space[3],
                opacity: done || active ? 1 : 0.4,
              }}
            >
              <View
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: radius.pill,
                  backgroundColor: done ? colors.accent2Ramp[500] : colors.neutralRamp[400],
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? (
                  <Icon name="check" size={13} strokeWidth={3.4} color={colors.surface} />
                ) : null}
              </View>
              <Text variant="smallMedium">{label}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
