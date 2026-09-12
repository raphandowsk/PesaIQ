import { Pressable, View } from 'react-native';

import { colors, MIN_TOUCH, radius, shadow } from '../../theme';

// The design's track and knob.
const TRACK_W = 52;
const TRACK_H = 30;
const KNOB = 24;
const INSET = 3;

export interface SwitchProps {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  /** Shown but not changeable: the feature does not exist yet. */
  disabled?: boolean;
  accessibilityLabel: string;
}

/** The design's pill switch, with a full-height touch target. */
export function Switch({ value, onValueChange, disabled, accessibilityLabel }: SwitchProps) {
  return (
    <Pressable
      onPress={() => onValueChange?.(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      // react-native-web does not carry accessibilityState.checked over for a
      // switch, so a screen reader there could not tell on from off.
      aria-checked={value}
      accessibilityLabel={accessibilityLabel}
      style={{
        width: TRACK_W,
        height: MIN_TOUCH,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: TRACK_W,
          height: TRACK_H,
          borderRadius: radius.pill,
          padding: INSET,
          flexDirection: 'row',
          justifyContent: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? colors.accent2Ramp[500] : colors.neutralRamp[400],
        }}
      >
        <View
          style={[
            {
              width: KNOB,
              height: KNOB,
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
            },
            shadow.sm,
          ]}
        />
      </View>
    </Pressable>
  );
}
