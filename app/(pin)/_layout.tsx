import { Stack } from 'expo-router';

import { colors } from '../../theme';

/** After signing in: create the PIN, or enter it on a new phone. */
export default function PinLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="create-pin" />
      <Stack.Screen name="unlock" />
    </Stack>
  );
}
