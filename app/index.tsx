import { Redirect } from 'expo-router';

import { landingFor, useAuthStore, type KeyState } from '../features/auth';
import { usePinStore } from '../features/pin';
import { useAppStore } from '../features/transactions';

/**
 * The one place that decides where a launch lands (features/auth/routing.ts).
 *
 * Signing in, the PIN, onboarding's finish, signing out and deleting the
 * account all end with `router.replace('/')` back here, so the rule is never
 * duplicated. The root layout's `Stack.Protected` guards enforce the same rule.
 */
export default function Index() {
  const onboarded = useAppStore((s) => s.settings.onboardingComplete);
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const pinStatus = usePinStore((s) => s.status);
  const key: KeyState =
    pinStatus === 'ready' ? 'ready' : pinStatus === 'needsUnlock' ? 'unlock' : 'create';
  return <Redirect href={landingFor(signedIn, key, onboarded)} />;
}
