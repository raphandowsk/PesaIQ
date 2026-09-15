import { TextInput, View } from 'react-native';

import { NAME_MAX_LENGTH } from '../../features/profile/name';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';
import { Text } from '../ui/Text';

export interface NameFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  onSubmit?: () => void;
  autoFocus?: boolean;
}

/** The optional first-name field, as onboarding and Settings show it. */
export function NameField({ value, onChangeText, onSubmit, autoFocus = false }: NameFieldProps) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="small" style={{ fontFamily: fonts.semibold }}>
        First name
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Optional"
        placeholderTextColor={colors.neutralRamp[600]}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="done"
        maxLength={NAME_MAX_LENGTH}
        autoFocus={autoFocus}
        accessibilityLabel="First name, optional"
        style={{
          minHeight: MIN_TOUCH,
          borderWidth: 1,
          borderColor: colors.neutralRamp[400],
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          paddingHorizontal: space[4],
          fontFamily: fonts.semibold,
          fontSize: 16,
          color: colors.text,
        }}
      />
    </View>
  );
}
