import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type StyleProp,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, MIN_TOUCH, radius, space } from '../../theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  /** `lg` is the design's 54px call-to-action at the foot of a screen. */
  size?: Size;
  loading?: boolean;
  block?: boolean;
  left?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

const LARGE_HEIGHT = 54;

/**
 * Pill button. Pressed states step one rung down the accent ramp, matching the
 * design's interaction rules.
 */
export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  left,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const large = size === 'lg';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLabel={label}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          minHeight: large ? LARGE_HEIGHT : MIN_TOUCH,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          paddingHorizontal: space[4],
          paddingVertical: large ? space[3] : space[2],
          borderRadius: radius.pill,
          opacity: isDisabled ? 0.45 : 1,
          ...surfaceFor(variant, pressed),
        },
        (block || large) && { alignSelf: 'stretch' },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator size="small" color={inkFor(variant)} />
      ) : (
        <>
          {left ? <View>{left}</View> : null}
          <Text variant={large ? 'button' : 'bodyMedium'} style={{ color: inkFor(variant) }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

function surfaceFor(variant: Variant, pressed: boolean): ViewStyle {
  switch (variant) {
    case 'primary':
      return {
        backgroundColor: pressed ? colors.accentRamp[700] : colors.accent,
      };
    case 'danger':
      return {
        backgroundColor: pressed ? colors.accentRamp[200] : 'transparent',
        borderWidth: 1,
        borderColor: colors.accentRamp[500],
      };
    case 'secondary':
      return {
        backgroundColor: pressed ? colors.neutralRamp[200] : 'transparent',
        borderWidth: 1,
        borderColor: colors.neutralRamp[300],
      };
    case 'ghost':
      return { backgroundColor: pressed ? colors.accentRamp[100] : 'transparent' };
  }
}

function inkFor(variant: Variant): string {
  if (variant === 'primary') return colors.surface;
  if (variant === 'danger' || variant === 'ghost') return colors.accentRamp[700];
  // The design sets secondary labels in neutral-700, a step softer than body text.
  return colors.neutralRamp[700];
}
