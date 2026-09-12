import { Children, type ReactNode } from 'react';
import { View } from 'react-native';

import { colors, fonts, radius, space } from '../../theme';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Text } from '../ui/Text';

/** A titled card of rows, divided as in the design. */
export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <View style={{ marginBottom: space[4] }}>
      <Text
        variant="kicker"
        tone="muted"
        accessibilityRole="header"
        style={{ marginBottom: space[2], paddingLeft: space[1] }}
      >
        {title}
      </Text>
      <Card style={{ paddingVertical: space[1], paddingHorizontal: space[4] }}>
        {rows.map((row, i) => (
          <View
            key={i}
            style={
              i < rows.length - 1
                ? { borderBottomWidth: 1, borderBottomColor: colors.divider }
                : undefined
            }
          >
            {row}
          </View>
        ))}
      </Card>
    </View>
  );
}

/** Label and explanation on the left, a switch, tag or button on the right. */
export function SettingRow({
  label,
  sub,
  right,
  children,
}: {
  label: string;
  sub?: string;
  right?: ReactNode;
  /** Shown under the row, e.g. a confirmation. */
  children?: ReactNode;
}) {
  return (
    <View style={{ paddingVertical: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyMedium" style={{ fontFamily: fonts.semibold, fontSize: 14 }}>
            {label}
          </Text>
          {sub ? (
            <Text
              variant="small"
              tone="muted"
              style={{ fontSize: 12, lineHeight: 17, marginTop: 2 }}
            >
              {sub}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** The in-place "are you sure" for anything that cannot be undone. */
export function ConfirmPanel({
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        backgroundColor: colors.accentRamp[100],
        borderRadius: radius.md,
        padding: space[3],
        marginTop: space[2],
        gap: space[2],
      }}
    >
      <Text variant="small" style={{ color: colors.accentRamp[900] }}>
        {message}
      </Text>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button
          label={confirmLabel}
          variant="danger"
          loading={busy}
          disabled={busy}
          onPress={onConfirm}
          style={{ flex: 1 }}
        />
        <Button
          label="Keep"
          variant="ghost"
          disabled={busy}
          onPress={onCancel}
          style={{ flex: 1 }}
        />
      </View>
    </View>
  );
}
