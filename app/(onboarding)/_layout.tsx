import { Stack } from 'expo-router';

import { useAuthStore } from '../../features/auth';
import { usePinStore } from '../../features/pin';
import { colors } from '../../theme';

/**
 * Welcome and How it works come before signing in; Privacy, the optional name
 * and the senders picker come after, so they need an account and its PIN.
 */
export default function OnboardingLayout() {
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const keyReady = usePinStore((s) => s.status === 'ready');

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
      <Stack.Protected guard={signedIn && keyReady}>
        <Stack.Screen name="privacy" />
        <Stack.Screen name="name" />
        <Stack.Screen name="setup" />
      </Stack.Protected>
    </Stack>
  );
}
