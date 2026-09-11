import { Redirect } from 'expo-router';

import { useAppStore } from '../features/transactions';

/**
 * The one place that decides where a launch lands.
 *
 * Onboarding's finish and Settings' "Replay onboarding" both flip the flag and
 * then `router.replace('/')` back here, so this rule is never duplicated. The
 * root layout's `Stack.Protected` guards enforce the same rule structurally.
 */
export default function Index() {
  const onboarded = useAppStore((s) => s.settings.onboardingComplete);
  return <Redirect href={onboarded ? '/dashboard' : '/welcome'} />;
}
