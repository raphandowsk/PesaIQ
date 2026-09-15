import { View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Icon, Text } from '../../components/ui';
import { PRIVACY_POINTS } from '../../features/onboarding/content';
import { colors, radius, space } from '../../theme';

const SHIELD = 60;
const TICK = 22;

/** How messages are handled. They are read on the phone: nothing to agree to. */
export default function Privacy() {
  return (
    <OnboardingFrame
      backTo="/how-it-works"
      badge={
        <View
          style={{
            width: SHIELD,
            height: SHIELD,
            borderRadius: radius.pill,
            backgroundColor: colors.accentRamp[200],
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: space[4],
          }}
        >
          <Icon name="shield" size={28} color={colors.accentRamp[800]} />
        </View>
      }
      title="Your messages stay here"
      subtitle="Your financial data is sensitive."
      cta={{ label: 'I understand', onPress: () => router.push('/setup') }}
    >
      <View style={{ gap: space[2] }}>
        {PRIVACY_POINTS.map((point) => (
          <View
            key={point}
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: space[3],
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              padding: space[3],
            }}
          >
            <View
              style={{
                width: TICK,
                height: TICK,
                borderRadius: radius.pill,
                backgroundColor: colors.accent2Ramp[300],
                alignItems: 'center',
                justifyContent: 'center',
                marginTop: 1,
              }}
            >
              <Icon name="check" size={13} strokeWidth={3.4} color={colors.accent2Ramp[900]} />
            </View>
            <Text variant="body" style={{ flex: 1, color: colors.neutralRamp[800] }}>
              {point}
            </Text>
          </View>
        ))}
      </View>
    </OnboardingFrame>
  );
}
