import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';

import { BackButton } from '../components/ui/BackButton';
import { Button, Card, Icon, Screen, Text, toast } from '../components/ui';
import {
  EXPORT_FORMATS,
  EXPORT_RANGES,
  planExport,
  type ExportFormat,
  type ExportRange,
} from '../features/export/format';
import { useAppStore } from '../features/transactions';
import { saveExport } from '../services/export/saveExport';
import { colors, fonts, MIN_TOUCH, radius, shadow, space } from '../theme';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/settings'));

// Both are true to how the file is saved on each platform.
const SAVE_NOTE =
  Platform.OS === 'web'
    ? 'Export runs only when you tap the button. Your browser saves the file; nothing is sent anywhere.'
    : 'Export runs only when you tap the button. You pick a folder on this device; nothing is sent anywhere.';

/**
 * Export: choose a format and range, see exactly what will be written, then
 * write it. Nothing leaves the screen until the button is tapped.
 */
export default function ExportData() {
  const transactions = useAppStore((s) => s.transactions);

  const [format, setFormat] = useState<ExportFormat>('CSV');
  const [range, setRange] = useState<ExportRange>('30d');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The range is measured from when the screen opened, so the preview and the
  // file always agree.
  const [now] = useState(() => new Date());

  const plan = useMemo(
    () => planExport(transactions, format, range, now),
    [transactions, format, range, now],
  );

  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await saveExport(plan);
      toast(
        outcome.status === 'saved'
          ? `Saved ${outcome.name}.`
          : 'Export cancelled. Nothing was saved.',
      );
    } catch {
      setError('The file could not be saved. Try again, or pick another folder.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space[3],
          paddingTop: space[3],
          marginBottom: space[4],
        }}
      >
        <BackButton onPress={leave} />
        <Text variant="h2" accessibilityRole="header" style={{ flex: 1, fontSize: 20 }}>
          Export data
        </Text>
      </View>

      <Text variant="kicker" tone="muted" style={{ marginBottom: space[2] }}>
        Format
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', gap: space[2], marginBottom: space[4] }}
      >
        {EXPORT_FORMATS.map((f) => {
          const on = f.key === format;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFormat(f.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={`${f.key}. ${f.sub}`}
              style={({ pressed }) => ({
                flex: 1,
                borderRadius: radius.md,
                borderWidth: 1,
                paddingVertical: space[4],
                paddingHorizontal: space[3],
                borderColor: on ? colors.accent2Ramp[500] : colors.neutralRamp[300],
                backgroundColor: on
                  ? colors.accent2Ramp[200]
                  : pressed
                    ? colors.neutralRamp[200]
                    : colors.surface,
              })}
            >
              <Text
                variant="bodyMedium"
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 17,
                  color: on ? colors.accent2Ramp[900] : colors.text,
                }}
              >
                {f.key}
              </Text>
              <Text
                variant="small"
                style={{
                  fontSize: 11,
                  marginTop: 2,
                  color: on ? colors.accent2Ramp[800] : colors.neutralRamp[700],
                }}
              >
                {f.sub}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text variant="kicker" tone="muted" style={{ marginBottom: space[2] }}>
        Range
      </Text>
      <View
        accessibilityRole="radiogroup"
        style={{ flexDirection: 'row', gap: space[2], marginBottom: space[4] }}
      >
        {EXPORT_RANGES.map((r) => {
          const on = r.key === range;
          return (
            <Pressable
              key={r.key}
              onPress={() => setRange(r.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              aria-checked={on}
              accessibilityLabel={r.key === 'all' ? 'All records' : `Last ${r.label}`}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: MIN_TOUCH,
                borderRadius: radius.pill,
                borderWidth: 1,
                alignItems: 'center',
                justifyContent: 'center',
                borderColor: on ? colors.accentRamp[300] : colors.neutralRamp[300],
                backgroundColor: on
                  ? colors.accentRamp[200]
                  : pressed
                    ? colors.neutralRamp[200]
                    : colors.surface,
              })}
            >
              <Text
                variant="small"
                style={{
                  fontFamily: fonts.bold,
                  fontSize: 13,
                  color: on ? colors.accentRamp[900] : colors.neutralRamp[800],
                }}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={{ marginBottom: space[3], gap: space[2] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <Text variant="kicker" tone="muted" style={{ flex: 1 }}>
            Preview
          </Text>
          <View
            style={{
              backgroundColor: colors.neutralRamp[200],
              borderRadius: radius.pill,
              paddingHorizontal: space[2],
              paddingVertical: space[1],
            }}
          >
            <Text variant="kicker" style={{ fontSize: 10, color: colors.neutralRamp[700] }}>
              {plan.count} {plan.count === 1 ? 'row' : 'rows'}
            </Text>
          </View>
        </View>
        <View style={{ backgroundColor: colors.bg, borderRadius: radius.md, padding: space[3] }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text
              variant="mono"
              selectable
              accessibilityLabel={`Preview of the ${format} file`}
              style={{ fontSize: 10, lineHeight: 17, color: colors.neutralRamp[800] }}
            >
              {plan.preview}
            </Text>
          </ScrollView>
        </View>
        {plan.count === 0 ? (
          <Text variant="small" tone="muted">
            No saved records in this range.
          </Text>
        ) : null}
        {plan.demoLeftOut > 0 ? (
          <Text variant="small" tone="muted">
            {plan.demoLeftOut} demo {plan.demoLeftOut === 1 ? 'record is' : 'records are'} left out:
            they are invented samples.
          </Text>
        ) : null}
      </Card>

      <View
        style={{
          backgroundColor: colors.accent2Ramp[200],
          borderRadius: radius.md,
          padding: space[3],
          marginBottom: space[3],
        }}
      >
        <Text
          variant="small"
          style={{ fontSize: 12, lineHeight: 18, color: colors.accent2Ramp[900] }}
        >
          {SAVE_NOTE}
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

      <Button
        label={plan.count === 0 ? 'Nothing to export' : `Export ${format}`}
        size="lg"
        loading={busy}
        disabled={busy || plan.count === 0}
        left={<Icon name="download" size={20} color={colors.surface} />}
        onPress={() => void onExport()}
        style={shadow.md}
      />
    </Screen>
  );
}
