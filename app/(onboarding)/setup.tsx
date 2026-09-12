import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Tag, Text } from '../../components/ui';
import { SETUP_COPY } from '../../features/onboarding/content';
import { PROVIDERS, type SmsProvider } from '../../features/parser';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';

/** The database lists providers by name; the design lists them by prominence. */
const registryOrder = (p: SmsProvider) => {
  const i = PROVIDERS.findIndex((x) => x.id === p.id);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

export default function Setup() {
  const providers = useAppStore((s) => s.providers);
  const setProviderEnabled = useAppStore((s) => s.setProviderEnabled);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);

  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ordered = [...providers].sort((a, b) => registryOrder(a) - registryOrder(b));

  const toggle = async (p: SmsProvider) => {
    setError(null);
    try {
      await setProviderEnabled(p.id, !p.enabled);
    } catch {
      setError(`Could not update ${p.name}. Try again.`);
    }
  };

  const finish = async () => {
    setFinishing(true);
    setError(null);
    try {
      await completeOnboarding();
      router.replace('/');
    } catch {
      setError('Could not save your setup. Try again.');
      setFinishing(false);
    }
  };

  return (
    <OnboardingFrame
      backTo="/privacy"
      title={SETUP_COPY.title}
      subtitle={SETUP_COPY.body}
      footnote={
        <View
          style={{ backgroundColor: colors.surface, borderRadius: radius.md, padding: space[3] }}
        >
          <Text variant="small" tone="muted">
            {SETUP_COPY.note}
          </Text>
        </View>
      }
      cta={{ label: 'Open dashboard', onPress: () => void finish(), loading: finishing }}
    >
      <Tag label={SETUP_COPY.maturity} tone="accent" style={{ marginBottom: space[4] }} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {ordered.map((p) => (
          <ProviderChip
            key={p.id}
            name={p.name}
            selected={p.enabled}
            onToggle={() => void toggle(p)}
          />
        ))}
      </View>

      {error ? (
        <Text
          variant="small"
          tone="accent"
          style={{ marginTop: space[3] }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </OnboardingFrame>
  );
}

function ProviderChip({
  name,
  selected,
  onToggle,
}: {
  name: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      aria-checked={selected}
      accessibilityLabel={name}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH,
        paddingHorizontal: space[4],
        borderRadius: radius.pill,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: selected ? colors.accent2Ramp[500] : colors.neutralRamp[300],
        backgroundColor: selected
          ? colors.accent2Ramp[300]
          : pressed
            ? colors.neutralRamp[200]
            : colors.surface,
      })}
    >
      <Text
        variant="small"
        style={{
          fontFamily: fonts.semibold,
          fontSize: 14,
          color: selected ? colors.accent2Ramp[900] : colors.neutralRamp[800],
        }}
      >
        {name}
      </Text>
    </Pressable>
  );
}
