import { Stack } from 'expo-router';

import { useAuthStore } from '../../features/auth';
import { colors } from '../../theme';

/**
 * Welcome and How it works come before signing in; Privacy and the senders
 * picker come after, so they need an account.
 */
export default function OnboardingLayout() {
  const signedIn = useAuthStore((s) => s.status === 'signedIn');

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
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="privacy" />
        <Stack.Screen name="setup" />
      </Stack.Protected>
    </Stack>
  );
}
