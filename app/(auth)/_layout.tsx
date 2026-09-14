import { Stack } from 'expo-router';

import { colors } from '../../theme';

/** Signing in: the mobile number, then the code sent to it. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="phone" />
      <Stack.Screen name="code" />
    </Stack>
  );
}
