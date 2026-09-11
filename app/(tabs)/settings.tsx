import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Screen, Tag, Text } from '../../components/ui';
import { useAppStore } from '../../features/transactions';
import { space } from '../../theme';

type Busy = 'replay' | 'demo' | null;

/**
 * Interim Settings. Replay onboarding and Remove demo data are real — the first
 * is what makes onboarding testable more than once on a device. Toggles,
 * providers, export and deletion arrive in 1I.
 */
export default function Settings() {
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);
  const clearDemoData = useAppStore((s) => s.clearDemoData);
  const demoOn = useAppStore((s) => s.settings.demoDataEnabled);

  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That change could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const replay = () =>
    run('replay', async () => {
      await resetOnboarding();
      router.replace('/');
    });

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[6], gap: space[2] }}>
        <Text variant="title">Settings</Text>
        <Tag label="Preview · full settings in 1I" tone="neutral" />
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

      <View style={{ marginTop: space[4], gap: space[3] }}>
        <Card style={{ gap: space[2] }}>
          <Text variant="bodyMedium">Replay onboarding</Text>
          <Text variant="small" tone="muted">
            See the welcome, privacy and provider screens again. Your records are kept.
          </Text>
          <Button
            label="Replay"
            variant="secondary"
            loading={busy === 'replay'}
            disabled={busy !== null}
            onPress={() => void replay()}
            style={{ alignSelf: 'flex-start' }}
          />
        </Card>

        <Card style={{ gap: space[2] }}>
          <Text variant="bodyMedium">Demo data</Text>
          <Text variant="small" tone="muted">
            {demoOn
              ? 'Sample records are included. They are invented, not real messages.'
              : 'Removed. Only records you saved remain.'}
          </Text>
          {demoOn ? (
            <Button
              label="Remove demo data"
              variant="danger"
              loading={busy === 'demo'}
              disabled={busy !== null}
              onPress={() => void run('demo', clearDemoData)}
              style={{ alignSelf: 'flex-start' }}
            />
          ) : null}
        </Card>

        <Card style={{ gap: space[1] }}>
          <Text variant="kicker" tone="muted">
            PesaIQ · Stage 1
          </Text>
          <Text variant="small" tone="muted">
            Pasted messages only. No SMS is intercepted, uploaded or logged in full. Provider
            parsers are demo rules until anonymized fixtures validate them.
          </Text>
        </Card>
      </View>
    </Screen>
  );
}
