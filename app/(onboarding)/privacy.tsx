import { View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Icon, Text } from '../../components/ui';
import { PRIVACY_DISCLAIMER, PRIVACY_POINTS } from '../../features/onboarding/content';
import { useAppStore } from '../../features/transactions';
import { colors, radius, space } from '../../theme';

const SHIELD = 60;
const TICK = 22;

/**
 * How messages are handled, agreed to before the first one is read. Messages
 * go to Claude to be read, so the agreement is recorded (aiReadingAccepted).
 */
export default function Privacy() {
  const setSetting = useAppStore((s) => s.setSetting);

  const agree = async () => {
    await setSetting('aiReadingAccepted', true);
    router.push('/setup');
  };

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
      title="How your messages are read"
      subtitle="Your financial data is sensitive."
      cta={{ label: 'I agree', onPress: () => void agree() }}
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

        <Text
          variant="small"
          tone="muted"
          style={{ paddingHorizontal: space[1], paddingTop: space[1] }}
        >
          {PRIVACY_DISCLAIMER}
        </Text>
      </View>
    </OnboardingFrame>
  );
}
