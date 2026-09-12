import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { ConfirmPanel, SettingRow, SettingsGroup } from '../../components/settings/SettingsList';
import { Button, Screen, Tag, Text, toast } from '../../components/ui';
import { Switch } from '../../components/ui/Switch';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import type { ProviderMaturity } from '../../types/domain';

type DataAction = 'transactions' | 'messages' | 'history' | 'demo' | 'rules';
type Busy = DataAction | 'replay' | null;

const COUNTRIES: Record<string, string> = { TZ: 'Tanzania' };

// Never more than the registry says: a demo parser is labelled a demo.
const MATURITY: Record<ProviderMaturity, { tag: string; rules: string }> = {
  DEMO: { tag: 'Demo', rules: 'demo rules' },
  EXPERIMENTAL: { tag: 'Experimental', rules: 'experimental rules' },
  SUPPORTED: { tag: 'Supported', rules: 'validated rules' },
};

const FAILED = 'That could not be completed. Nothing was changed.';

/**
 * Settings, grouped as in the design. Anything that deletes asks first, in
 * place. Automatic processing, cloud sync and AI fallback do not exist in
 * Stage 1, so their switches are shown locked off rather than pretending.
 */
export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const providers = useAppStore((s) => s.providers);
  const recordCount = useAppStore((s) => s.transactions.length);
  const deleteAllTransactions = useAppStore((s) => s.deleteAllTransactions);
  const deleteAllMessages = useAppStore((s) => s.deleteAllMessages);
  const clearProcessingHistory = useAppStore((s) => s.clearProcessingHistory);
  const clearDemoData = useAppStore((s) => s.clearDemoData);
  const forgetCategoryRules = useAppStore((s) => s.forgetCategoryRules);
  const ruleCount = useAppStore((s) => Object.keys(s.categoryRules).length);
  const resetOnboarding = useAppStore((s) => s.resetOnboarding);

  const [confirming, setConfirming] = useState<DataAction | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: Exclude<Busy, null>, action: () => Promise<string | null>) => {
    setBusy(key);
    setError(null);
    try {
      const done = await action();
      setConfirming(null);
      if (done) toast(done);
    } catch {
      setError(FAILED);
    } finally {
      setBusy(null);
    }
  };

  const ACTIONS: Record<DataAction, { ask: string; confirm: string; go: () => Promise<string> }> = {
    transactions: {
      ask: `Delete all ${recordCount} ${recordCount === 1 ? 'record' : 'records'}? Their source messages go with them. This cannot be undone.`,
      confirm: 'Delete permanently',
      go: async () => {
        const n = await deleteAllTransactions();
        return `${n} ${n === 1 ? 'record' : 'records'} deleted, with their messages.`;
      },
    },
    messages: {
      ask: 'Delete every stored source message? Your records stay, but their original text can no longer be shown. This cannot be undone.',
      confirm: 'Delete permanently',
      go: async () => {
        await deleteAllMessages();
        return 'Source messages deleted. Your records are kept.';
      },
    },
    history: {
      ask: 'Clear parse events and corrections? Your streak and "cleared this week" start again from zero.',
      confirm: 'Clear history',
      go: async () => {
        await clearProcessingHistory();
        return 'Processing history cleared.';
      },
    },
    demo: {
      ask: 'Remove the demo sample records? Records you saved are kept.',
      confirm: 'Remove demo data',
      go: async () => {
        await clearDemoData();
        return 'Demo data removed.';
      },
    },
    rules: {
      ask: `Forget the categories you chose for ${ruleCount} ${ruleCount === 1 ? 'recipient' : 'recipients'}? Saved records keep their categories; new messages go back to the rules.`,
      confirm: 'Forget',
      go: async () => {
        const n = await forgetCategoryRules();
        return `${n} remembered ${n === 1 ? 'category' : 'categories'} forgotten.`;
      },
    },
  };

  const ask = (key: DataAction) => {
    setError(null);
    setConfirming(key);
  };

  /** The row's button, or its confirmation once tapped. */
  const actionRow = (
    key: DataAction,
    label: string,
    sub: string,
    buttonLabel: string,
    opts: { danger?: boolean; disabled?: boolean } = {},
  ) => (
    <SettingRow
      label={label}
      sub={sub}
      right={
        confirming === key ? null : (
          <Button
            label={buttonLabel}
            accessibilityLabel={`${buttonLabel}: ${label}`}
            variant={opts.danger ? 'danger' : 'secondary'}
            disabled={busy !== null || opts.disabled}
            onPress={() => ask(key)}
          />
        )
      }
    >
      {confirming === key ? (
        <ConfirmPanel
          message={ACTIONS[key].ask}
          confirmLabel={ACTIONS[key].confirm}
          busy={busy === key}
          onConfirm={() => void run(key, ACTIONS[key].go)}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </SettingRow>
  );

  const replay = () =>
    run('replay', async () => {
      await resetOnboarding();
      router.replace('/');
      return null;
    });

  return (
    <Screen scroll>
      <View style={{ paddingTop: space[4], marginBottom: space[4] }}>
        <Text variant="h1" accessibilityRole="header" style={{ fontSize: 26 }}>
          Settings
        </Text>
      </View>

      {error ? (
        <Text
          variant="small"
          tone="accent"
          style={{ marginBottom: space[3] }}
          accessibilityLiveRegion="polite"
        >
          {error}
        </Text>
      ) : null}

      <SettingsGroup title="Processing">
        <SettingRow
          label="Automatic processing"
          sub="Off in Stage 1. Messages are analyzed only when you paste them."
          right={
            <Switch
              value={settings.automaticProcessing}
              disabled
              accessibilityLabel="Automatic processing. Not available in Stage 1."
            />
          }
        />
        <SettingRow
          label="SMS source"
          sub="Pasted messages only. No SMS is read from your phone."
          right={<Tag label="Stage 1" />}
        />
        <SettingRow
          label="Cloud sync"
          sub="Not available. Records stay on this device only."
          right={
            <Switch
              value={settings.cloudSync}
              disabled
              accessibilityLabel="Cloud sync. Not available; records stay on this device."
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <SettingRow
          label="On-device parsing"
          sub="Rules run locally; full messages are never logged."
          right={<Tag label="On" tone="positive" />}
        />
        {actionRow(
          'transactions',
          'Delete all transactions',
          recordCount > 0
            ? 'Removes every saved record, with its source message.'
            : 'No records are saved.',
          'Delete',
          { danger: true, disabled: recordCount === 0 },
        )}
        {actionRow(
          'messages',
          'Delete all messages',
          'Removes stored source messages. Records are kept.',
          'Delete',
          { danger: true },
        )}
        {actionRow(
          'history',
          'Clear processing history',
          'Removes parse events and corrections.',
          'Clear',
        )}
      </SettingsGroup>

      <SettingsGroup title="AI · fallback">
        <SettingRow
          label="AI fallback parsing"
          sub="Off. No AI provider is connected in Stage 1, so no message can be sent anywhere."
          right={
            <Switch
              value={settings.aiFallback}
              disabled
              accessibilityLabel="AI fallback parsing. Off; no AI provider is connected."
            />
          }
        />
        <SettingRow
          label="AI provider"
          sub="None connected in Stage 1."
          right={<Tag label="Not set" />}
        />
      </SettingsGroup>

      <SettingsGroup title="Providers">
        {providers.map((p) => (
          <SettingRow
            key={p.id}
            label={p.name}
            sub={`${COUNTRIES[p.country] ?? p.country} · ${MATURITY[p.maturity].rules} · ${p.enabled ? 'watching' : 'not watching'}`}
            right={
              <Tag
                label={MATURITY[p.maturity].tag}
                tone={p.maturity === 'SUPPORTED' ? 'positive' : 'neutral'}
              />
            }
          />
        ))}
      </SettingsGroup>

      <SettingsGroup title="Data">
        <SettingRow
          label="Export my data"
          sub="CSV or JSON, on your action only."
          right={
            <Button
              label="Export"
              accessibilityLabel="Export my data"
              variant="secondary"
              disabled={busy !== null}
              onPress={() => router.push('/export')}
            />
          }
        />
        {actionRow(
          'rules',
          'Remembered categories',
          ruleCount > 0
            ? `${ruleCount} ${ruleCount === 1 ? 'recipient is' : 'recipients are'} filed the way you chose. Deleted along with all transactions.`
            : 'None yet. Pick a category on a record and messages to that recipient get it too.',
          'Forget',
          { disabled: ruleCount === 0 },
        )}
        <SettingRow
          label="Demo data"
          sub={
            settings.demoDataEnabled
              ? 'Sample records are included. They are invented, not real messages.'
              : 'Removed. Only records you saved remain.'
          }
          right={
            <Tag
              label={settings.demoDataEnabled ? 'On' : 'Off'}
              tone={settings.demoDataEnabled ? 'positive' : 'neutral'}
            />
          }
        />
        {settings.demoDataEnabled
          ? actionRow('demo', 'Remove demo data', 'Deletes generated sample records.', 'Remove', {
              danger: true,
            })
          : null}
      </SettingsGroup>

      <View
        style={{
          backgroundColor: colors.neutralRamp[200],
          borderRadius: radius.lg,
          padding: space[4],
          gap: space[1],
        }}
      >
        <Text variant="bodyMedium" style={{ fontFamily: fonts.heading, fontSize: 15 }}>
          PesaIQ · Stage 1
        </Text>
        <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
          Pasted messages only. No SMS is intercepted, uploaded or logged in full. Mixx rules are
          experimental, built from real message layouts; other providers are demo rules until
          anonymized fixtures validate them.
        </Text>
        <Pressable
          onPress={() => void replay()}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel="Replay onboarding. Your records are kept."
          style={({ pressed }) => ({
            minHeight: MIN_TOUCH,
            justifyContent: 'center',
            alignSelf: 'flex-start',
            opacity: pressed || busy === 'replay' ? 0.6 : 1,
          })}
        >
          <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.accentRamp[700] }}>
            Replay onboarding →
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
