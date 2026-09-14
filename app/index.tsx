import { Redirect } from 'expo-router';

import { landingFor, useAuthStore } from '../features/auth';
import { useAppStore } from '../features/transactions';

/**
 * The one place that decides where a launch lands (features/auth/routing.ts).
 *
 * Signing in, onboarding's finish and Settings' "Replay onboarding" all end
 * with `router.replace('/')` back here, so the rule is never duplicated. The
 * root layout's `Stack.Protected` guards enforce the same rule structurally.
 */
export default function Index() {
  const onboarded = useAppStore((s) => s.settings.onboardingComplete);
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  return <Redirect href={landingFor(signedIn, onboarded)} />;
}
