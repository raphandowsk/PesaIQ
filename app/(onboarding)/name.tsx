import { useState } from 'react';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { NameField } from '../../components/profile/NameField';
import { Text } from '../../components/ui';
import { cleanName, welcomeLine } from '../../features/profile/name';
import { useAppStore } from '../../features/transactions';
import { space } from '../../theme';

/**
 * The optional name Home greets by. Leaving it empty skips it: Home then says
 * "Welcome back". Settings changes it later.
 */
export default function NameStep() {
  const saved = useAppStore((s) => s.displayName);
  const setDisplayName = useAppStore((s) => s.setDisplayName);

  const [value, setValue] = useState(saved ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typed = cleanName(value);

  const next = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await setDisplayName(value);
      router.push('/setup');
    } catch {
      setError('Could not save your name. Try again, or leave it empty to skip.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingFrame
      backTo="/privacy"
      title="What should we call you?"
      subtitle="Optional. Home greets you by name, and you can change it in Settings."
      footnote={
        <Text variant="small" tone="muted">
          Kept on this phone. With Cloud sync on, it syncs locked, like your records.
        </Text>
      }
      cta={{
        // Clearing a name set before is a change too, so it says Continue.
        label: typed || saved ? 'Continue' : 'Skip',
        onPress: () => void next(),
        loading: saving,
      }}
    >
      <NameField
        value={value}
        onChangeText={(v) => {
          setValue(v);
          if (error) setError(null);
        }}
        onSubmit={() => void next()}
        autoFocus
      />
      <Text variant="small" tone="muted" style={{ marginTop: space[3] }}>
        Home will say “{welcomeLine(typed)}”.
      </Text>
      {error ? (
        <Text
          variant="small"
          tone="accent"
          style={{ marginTop: space[2] }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}
    </OnboardingFrame>
  );
}
