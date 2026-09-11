import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '../../components/ui';
import { WELCOME } from '../../features/onboarding/content';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, radius, space } from '../../theme';

// Geometry from the design's welcome screen.
const BLOB = 300;
const LOGO = 40;
const DOT = 6;
const ACTIVE_DOT = 26;

export default function Welcome() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const [skipping, setSkipping] = useState(false);

  // Skipping counts as finishing: the user chose it, and every screen they
  // skipped is reachable again from Settings -> Replay onboarding.
  const skip = async () => {
    setSkipping(true);
    try {
      await completeOnboarding();
      router.replace('/');
    } catch {
      setSkipping(false);
    }
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.bg, overflow: 'hidden' }}
    >
      <View
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          width: BLOB,
          height: BLOB,
          borderRadius: BLOB / 2,
          backgroundColor: colors.accent2Ramp[200],
          top: -80,
          right: -110,
        }}
      />

      <View
        style={{
          flex: 1,
          paddingHorizontal: space[4],
          paddingTop: space[6],
          paddingBottom: space[4],
        }}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
          accessible
          accessibilityLabel="PesaIQ"
        >
          <View
            style={{
              width: LOGO,
              height: LOGO,
              borderRadius: radius.pill,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text variant="h3" style={{ fontFamily: fonts.heading, color: colors.bg }}>
              P
            </Text>
          </View>
          <Text variant="h3" style={{ fontFamily: fonts.heading }}>
            PesaIQ
          </Text>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', gap: space[4], paddingTop: space[8] }}>
          <Text variant="display" accessibilityRole="header">
            {WELCOME.title}
          </Text>
          <Text variant="body" tone="muted">
            {WELCOME.body}
          </Text>
        </View>

        <View
          style={{ flexDirection: 'row', gap: DOT, marginBottom: space[4] }}
          accessible
          accessibilityLabel="Step 1 of 4"
        >
          <View
            style={{
              width: ACTIVE_DOT,
              height: DOT,
              borderRadius: radius.pill,
              backgroundColor: colors.accent,
            }}
          />
          {[2, 3, 4].map((n) => (
            <View
              key={n}
              style={{
                width: DOT,
                height: DOT,
                borderRadius: radius.pill,
                backgroundColor: colors.neutralRamp[400],
              }}
            />
          ))}
        </View>

        <View style={{ gap: space[2] }}>
          <Button label="Get started" size="lg" onPress={() => router.push('/how-it-works')} />
          <Button
            label="Skip to dashboard"
            variant="secondary"
            block
            loading={skipping}
            onPress={() => void skip()}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
