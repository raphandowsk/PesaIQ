import { useMemo, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { BackButton } from '../components/ui/BackButton';
import { Button, Card, Icon, Screen, Text, toast } from '../components/ui';
import {
  buildReport,
  canGoForward,
  changeText,
  customRange,
  formatDayInput,
  monthOf,
  parseDayInput,
  presetRange,
  RANGE_PRESETS,
  reportFilename,
  reportHtml,
  resolvePeriod,
  shiftMonth,
  type MonthPeriod,
  type RangePreset,
  type ReportLine,
  type ReportPeriod,
} from '../features/reports';
import { useAppStore } from '../features/transactions';
import { saveReportPdf } from '../services/reports/saveReportPdf';
import { colors, fonts, MIN_TOUCH, radius, space } from '../theme';
import { formatTzs, MINUS } from '../utils/format';

type Mode = 'month' | 'range';

const MODES: readonly { key: Mode; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: 'range', label: 'Custom range' },
];

const BAR_HEIGHT = 8;
const MIN_BAR_PCT = 3;
const STEP = 44;

// Both are true to how the PDF is saved on each platform.
const SAVE_NOTE =
  Platform.OS === 'web'
    ? 'The PDF is made only when you tap the button. Choose "Save as PDF" in the print window; nothing is sent anywhere.'
    : 'The PDF is made only when you tap the button. You pick a folder on this device; nothing is sent anywhere.';

const leave = () => (router.canGoBack() ? router.back() : router.replace('/dashboard'));

const signedTzs = (n: number) =>
  n > 0 ? `+${formatTzs(n)}` : n < 0 ? `${MINUS}${formatTzs(-n)}` : formatTzs(0);

function rangeFrom(fromText: string, toText: string) {
  const first = parseDayInput(fromText);
  const last = parseDayInput(toText);
  if (!first || !last) {
    return { period: null, error: 'Type both dates as DD/MM/YYYY, for example 01/09/2026.' };
  }
  const period = customRange(first, last);
  return period
    ? { period, error: null }
    : { period: null, error: 'The end date is before the start date.' };
}

/**
 * Reports: the monthly summary for a month, or a custom range of days, each
 * compared with the period before it, and saved as a PDF on request. Every
 * figure comes from `features/reports`, the same arithmetic as Home.
 */
export default function Reports() {
  const transactions = useAppStore((s) => s.transactions);
  // Periods are measured from when the screen opened.
  const [now] = useState(() => new Date());
  const [mode, setMode] = useState<Mode>('month');
  const [month, setMonth] = useState<MonthPeriod>(() => monthOf(now));
  const [fromText, setFromText] = useState(() =>
    formatDayInput(new Date(now.getFullYear(), now.getMonth(), 1)),
  );
  const [toText, setToText] = useState(() => formatDayInput(now));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => rangeFrom(fromText, toText), [fromText, toText]);
  const period: ReportPeriod | null = mode === 'month' ? month : range.period;
  const report = useMemo(
    () => (period ? buildReport(transactions, period) : null),
    [transactions, period],
  );

  const pickPreset = (key: RangePreset) => {
    const { from, to } = resolvePeriod(presetRange(key, now));
    setFromText(formatDayInput(from));
    setToText(formatDayInput(new Date(to.getFullYear(), to.getMonth(), to.getDate() - 1)));
  };

  const onSave = async () => {
    if (!report) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await saveReportPdf(reportHtml(report, new Date()), reportFilename(report));
      toast(
        outcome.status === 'saved'
          ? `Saved ${outcome.name}.`
          : outcome.status === 'printing'
            ? 'Choose "Save as PDF" in the print window.'
            : 'Cancelled. Nothing was saved.',
      );
    } catch {
      setError('The PDF could not be saved. Try again, or pick another folder.');
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
          Monthly report
        </Text>
      </View>

      <Choices options={MODES} value={mode} onChange={setMode} />

      {mode === 'month' ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            marginBottom: space[4],
          }}
        >
          <StepButton
            label="Previous month"
            back
            onPress={() => setMonth((m) => shiftMonth(m, -1))}
          />
          <Text
            variant="h2"
            accessibilityLiveRegion="polite"
            style={{ flex: 1, textAlign: 'center', fontSize: 18 }}
          >
            {resolvePeriod(month).label}
          </Text>
          <StepButton
            label="Next month"
            disabled={!canGoForward(month, now)}
            onPress={() => setMonth((m) => shiftMonth(m, 1))}
          />
        </View>
      ) : (
        <View style={{ gap: space[3], marginBottom: space[4] }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {RANGE_PRESETS.map((p) => (
              <Pressable
                key={p.key}
                onPress={() => pickPreset(p.key)}
                accessibilityRole="button"
                accessibilityLabel={p.label}
                style={({ pressed }) => ({
                  minHeight: 36,
                  paddingHorizontal: space[3],
                  borderRadius: radius.pill,
                  justifyContent: 'center',
                  backgroundColor: pressed ? colors.accentRamp[200] : colors.accentRamp[100],
                })}
              >
                <Text
                  variant="small"
                  style={{ fontFamily: fonts.bold, fontSize: 13, color: colors.accentRamp[900] }}
                >
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: space[3] }}>
            <DayInput label="From" value={fromText} onChange={setFromText} />
            <DayInput label="To" value={toText} onChange={setToText} />
          </View>
          {range.error ? (
            <Text
              variant="small"
              accessibilityLiveRegion="polite"
              style={{ color: colors.accentRamp[900], fontFamily: fonts.semibold }}
            >
              {range.error}
            </Text>
          ) : report ? (
            <Text variant="h2" style={{ fontSize: 18 }}>
              {report.period.label}
            </Text>
          ) : null}
        </View>
      )}

      {report ? (
        <>
          {report.demoCount > 0 ? (
            <Card style={{ marginBottom: space[3], backgroundColor: colors.accentRamp[100] }}>
              <Text variant="small" style={{ color: colors.accentRamp[900] }}>
                Includes {report.demoCount} invented demo sample{' '}
                {report.demoCount === 1 ? 'record' : 'records'}. Remove demo data in Settings for a
                report of your own records only.
              </Text>
            </Card>
          ) : null}

          <Totals report={report} />

          {report.needsReview > 0 ? (
            <Text variant="small" tone="muted" style={{ marginBottom: space[3] }}>
              {report.needsReview} {report.needsReview === 1 ? 'record is' : 'records are'} still
              waiting for review, so these totals may change.
            </Text>
          ) : null}

          <Section
            title="Spending by category"
            rows={report.spending}
            previous={report.previous.label}
            empty="Nothing spent in this period."
          />
          <Section
            title="Income by category"
            rows={report.income}
            previous={report.previous.label}
            empty="No income in this period."
          />
          <Section
            title="Fees & taxes by type"
            rows={report.fees}
            previous={report.previous.label}
            empty="No fees or taxes in this period."
          />

          <Button
            label="Save PDF"
            size="lg"
            block
            loading={busy}
            disabled={busy || report.totals.count === 0}
            onPress={onSave}
            style={{ marginTop: space[2] }}
          />
          {error ? (
            <Text
              variant="small"
              accessibilityLiveRegion="polite"
              style={{
                color: colors.accentRamp[900],
                fontFamily: fonts.semibold,
                marginTop: space[2],
              }}
            >
              {error}
            </Text>
          ) : null}
          <Text
            variant="small"
            tone="muted"
            style={{ marginTop: space[2], marginBottom: space[3] }}
          >
            {report.totals.count === 0
              ? 'No records in this period, so there is nothing to save. '
              : ''}
            {SAVE_NOTE}
          </Text>
        </>
      ) : null}

      <Text variant="small" tone="muted" style={{ fontSize: 12, lineHeight: 18 }}>
        Worked out from the records saved on this phone. Net is money in minus spending, fees and
        taxes. The PDF carries totals and categories only: no names, numbers, references or message
        text. It is a personal summary, not a bank statement or a tax document.
      </Text>
    </Screen>
  );
}

function Choices<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      style={{ flexDirection: 'row', gap: space[2], marginBottom: space[4] }}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={o.label}
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
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function StepButton({
  label,
  back = false,
  disabled = false,
  onPress,
}: {
  label: string;
  back?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      style={({ pressed }) => ({
        width: STEP,
        height: STEP,
        borderRadius: STEP / 2,
        borderWidth: 1,
        borderColor: colors.neutralRamp[300],
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : 1,
        backgroundColor: pressed ? colors.neutralRamp[200] : colors.surface,
      })}
    >
      <View style={back ? { transform: [{ rotate: '180deg' }] } : undefined}>
        <Icon name="chevronRight" size={18} color={colors.neutralRamp[800]} />
      </View>
    </Pressable>
  );
}

function DayInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ flex: 1, gap: space[1] }}>
      <Text variant="small" tone="muted">
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        accessibilityLabel={`${label} date, DD/MM/YYYY`}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={colors.neutralRamp[700]}
        keyboardType="numbers-and-punctuation"
        maxLength={10}
        autoCorrect={false}
        style={{
          minHeight: MIN_TOUCH,
          borderWidth: 1,
          borderColor: colors.neutralRamp[400],
          borderRadius: radius.pill,
          backgroundColor: colors.bg,
          paddingHorizontal: space[4],
          fontFamily: fonts.semibold,
          fontSize: 14,
          color: colors.text,
        }}
      />
    </View>
  );
}

function Totals({ report }: { report: NonNullable<ReturnType<typeof buildReport>> }) {
  const t = report.totals;
  const p = report.previousTotals;
  const cells = [
    { label: 'Money in', now: t.received, before: p.received, shown: formatTzs },
    { label: 'Spent', now: t.spent, before: p.spent, shown: formatTzs },
    { label: 'Fees & taxes', now: t.charges, before: p.charges, shown: formatTzs },
    { label: 'Net', now: t.net, before: p.net, shown: signedTzs },
  ];

  return (
    <Card style={{ marginBottom: space[3], gap: space[3] }}>
      <Text variant="kicker" tone="muted">
        {t.count} {t.count === 1 ? 'record' : 'records'} · compared with {report.previous.label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3] }}>
        {cells.map((c) => {
          const change =
            c.now === 0 && c.before === 0
              ? 'None in either period'
              : `${changeText(c.now, c.before)} · was ${c.shown(c.before)}`;
          return (
            <View
              key={c.label}
              accessible
              accessibilityLabel={`${c.label}: ${c.shown(c.now)}. ${change}.`}
              style={{ width: '50%', paddingRight: space[2], gap: 2 }}
            >
              <Text variant="small" tone="muted">
                {c.label}
              </Text>
              <Text variant="bodyMedium" style={{ fontFamily: fonts.heading, fontSize: 17 }}>
                {c.shown(c.now)}
              </Text>
              <Text variant="small" tone="muted" style={{ fontSize: 12 }}>
                {change}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Section({
  title,
  rows,
  previous,
  empty,
}: {
  title: string;
  rows: ReportLine[];
  previous: string;
  empty: string;
}) {
  return (
    <Card style={{ marginBottom: space[3], gap: space[3] }}>
      <Text variant="kicker" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      {rows.length === 0 ? (
        <Text variant="small" tone="muted">
          {empty}
        </Text>
      ) : (
        rows.map((row) => {
          const pct = Math.round(row.share * 100);
          const was = `${previous}: ${formatTzs(row.previous)} (${changeText(row.amount, row.previous)})`;
          return (
            <View
              key={row.key}
              accessible
              accessibilityLabel={`${row.label}: ${formatTzs(row.amount)}, ${pct}%. ${was}.`}
              style={{ gap: space[1] }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
                <Text
                  variant="bodyMedium"
                  numberOfLines={1}
                  style={{ flex: 1, minWidth: 0, fontFamily: fonts.semibold, fontSize: 14 }}
                >
                  {row.label}
                </Text>
                <Text variant="bodyMedium" style={{ fontFamily: fonts.heading, fontSize: 14 }}>
                  {formatTzs(row.amount)}
                </Text>
              </View>
              <View
                style={{
                  height: BAR_HEIGHT,
                  borderRadius: radius.pill,
                  backgroundColor: colors.neutralRamp[200],
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    height: '100%',
                    width: `${row.amount > 0 ? Math.max(MIN_BAR_PCT, pct) : 0}%`,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accentRamp[500],
                  }}
                />
              </View>
              <Text variant="small" tone="muted" style={{ fontSize: 12 }}>
                {pct}% · {was}
              </Text>
            </View>
          );
        })
      )}
    </Card>
  );
}
