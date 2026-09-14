import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import type { ParseResult } from '../../features/parser';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

type Factor = ParseResult['factors'][number];

const TICK = 18;
const BAR_HEIGHT = 7;
/** A missed factor keeps a sliver of bar, so it reads as empty rather than absent. */
const MISSED_PCT = 6;

/**
 * The explainability panel: what normalization did, why the message was
 * classified as it was, and which factors built the confidence score.
 */
export function HowWeGotThis({
  result,
  expanded,
  onToggle,
}: {
  result: ParseResult;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Bars scale to the heaviest factor, so the biggest contributor fills its track.
  const maxWeight = Math.max(...result.factors.map((f) => f.weight), Number.EPSILON);

  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="How we got this"
        style={({ pressed }) => ({
          minHeight: MIN_TOUCH,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[2],
          backgroundColor: pressed ? colors.neutralRamp[300] : colors.neutralRamp[200],
          borderRadius: radius.md,
          paddingVertical: space[3],
          paddingHorizontal: space[3],
        })}
      >
        <Text variant="bodyMedium" style={{ flex: 1, fontFamily: fonts.bold }}>
          How we got this
        </Text>
        <Text variant="small" tone="muted">
          {expanded ? 'Hide' : 'Show'}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
          <Icon name="chevronDown" size={18} />
        </View>
      </Pressable>

      {expanded ? (
        <Card style={{ marginTop: space[2], gap: space[4] }}>
          <Section title="1 · Normalized">
            <View
              style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space[3] }}
            >
              <Text
                variant="mono"
                selectable
                style={{ fontSize: 11, lineHeight: 17, color: colors.neutralRamp[800] }}
              >
                {result.normalizedText}
              </Text>
            </View>
            <Text variant="small" tone="muted">
              {result.normalizationNote} The original message is kept unchanged.
            </Text>
          </Section>

          <Section title="2 · Classified">
            {result.reasons.map((reason) => (
              <View
                key={reason}
                style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2] }}
              >
                <View
                  style={{
                    width: TICK,
                    height: TICK,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent2Ramp[300],
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginTop: 1,
                  }}
                >
                  <Icon name="check" size={11} strokeWidth={3.6} color={colors.accent2Ramp[900]} />
                </View>
                <Text variant="small" style={{ flex: 1 }}>
                  {reason}
                </Text>
              </View>
            ))}
          </Section>

          <Section title="3 · Confidence factors">
            {result.factors.map((factor) => (
              <FactorBar key={factor.label} factor={factor} maxWeight={maxWeight} />
            ))}
          </Section>

          <Text
            variant="small"
            tone="muted"
            style={{ borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space[3] }}
          >
            Parser{' '}
            <Text variant="small" style={{ fontFamily: fonts.bold }}>
              {result.parserId}
            </Text>{' '}
            . On-phone rules, no AI. Parsed from SMS, not verified with the provider: low-confidence
            fields are never treated as verified.
          </Text>
        </Card>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="kicker" tone="muted">
        {title}
      </Text>
      {children}
    </View>
  );
}

function FactorBar({ factor, maxWeight }: { factor: Factor; maxWeight: number }) {
  const pct = factor.hit ? Math.round((factor.weight / maxWeight) * 100) : MISSED_PCT;
  const spoken = factor.hit ? `adds ${factor.weight.toFixed(2)}` : 'missing';

  return (
    <View style={{ gap: space[1] }} accessible accessibilityLabel={`${factor.label}: ${spoken}`}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space[2] }}>
        <Text
          variant="small"
          style={{
            flex: 1,
            fontFamily: fonts.semibold,
            color: factor.hit ? colors.text : colors.accentRamp[700],
          }}
        >
          {factor.label}
        </Text>
        <Text variant="small" tone="muted">
          {factor.hit ? `+${factor.weight.toFixed(2)}` : 'missing'}
        </Text>
      </View>
      <View
        style={{
          height: BAR_HEIGHT,
          borderRadius: radius.pill,
          backgroundColor: colors.neutralRamp[300],
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: radius.pill,
            backgroundColor: factor.hit ? colors.accent2Ramp[500] : colors.accentRamp[400],
          }}
        />
      </View>
    </View>
  );
}
