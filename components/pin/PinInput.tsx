import { TextInput } from 'react-native';

import { PIN_LENGTH } from '../../features/pin/rules';
import { colors, fonts, radius } from '../../theme';

/** Four digits, hidden as they are typed. */
export function PinInput({
  value,
  onChange,
  label,
  disabled = false,
  invalid = false,
}: {
  value: string;
  onChange: (digits: string) => void;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={(typed) => onChange(typed.replace(/\D/g, '').slice(0, PIN_LENGTH))}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={PIN_LENGTH}
      autoFocus
      editable={!disabled}
      autoComplete="off"
      importantForAutofill="no"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      placeholder="••••"
      placeholderTextColor={colors.neutralRamp[400]}
      style={{
        minHeight: 64,
        borderWidth: 1,
        borderColor: invalid ? colors.accentRamp[500] : colors.neutralRamp[400],
        borderRadius: radius.lg,
        backgroundColor: disabled ? colors.neutralRamp[200] : colors.surface,
        textAlign: 'center',
        fontFamily: fonts.heading,
        fontSize: 30,
        letterSpacing: 18,
        color: colors.text,
      }}
    />
  );
}
