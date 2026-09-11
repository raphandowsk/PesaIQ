import { Stack } from 'expo-router';

import { colors } from '../../theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" />
      <Stack.Screen name="how-it-works" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="setup" />
    </Stack>
  );
}
