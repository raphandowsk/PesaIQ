import { View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Card, Text } from '../../components/ui';
import { afterIntro, useAuthStore } from '../../features/auth';
import { HOW_STEPS } from '../../features/onboarding/content';
import { colors, fonts, radius, space } from '../../theme';

const STEP_CIRCLE = 52;

export default function HowItWorks() {
  const signedIn = useAuthStore((s) => s.status === 'signedIn');

  return (
    <OnboardingFrame
      backTo="/welcome"
      title="How it works"
      subtitle="Four steps, all on your phone."
      cta={{ label: 'Continue', onPress: () => router.push(afterIntro(signedIn)) }}
    >
      <View style={{ gap: space[3] }}>
        {HOW_STEPS.map((step) => (
          <Card
            key={step.n}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}
            accessible
            accessibilityLabel={`Step ${step.n}, ${step.title}. ${step.body}`}
          >
            <View
              style={{
                width: STEP_CIRCLE,
                height: STEP_CIRCLE,
                borderRadius: radius.pill,
                backgroundColor: colors.accent2Ramp[200],
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text variant="h2" style={{ color: colors.accent2Ramp[800] }}>
                {step.n}
              </Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="h3" style={{ fontFamily: fonts.heading }}>
                {step.title}
              </Text>
              <Text variant="small" tone="muted">
                {step.body}
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </OnboardingFrame>
  );
}
