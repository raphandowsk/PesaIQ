import { useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import MARK from '../../assets/images/mark.png';
import { ScoreRing } from '../../components/dashboard/ScoreRing';
import { StatTile } from '../../components/dashboard/StatTiles';
import { Button, Tag, Text } from '../../components/ui';
import { useAuthStore } from '../../features/auth';
import { WELCOME } from '../../features/onboarding/content';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, money, radius, space } from '../../theme';

// Geometry from the design's welcome screen.
const BLOB = 300;
const LOGO = 40;
const DOT = 6;
const ACTIVE_DOT = 26;
const PREVIEW_RING = 96;

export default function Welcome() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const signedIn = useAuthStore((s) => s.status === 'signedIn');
  const [skipping, setSkipping] = useState(false);

  // Skipping counts as finishing: the user chose it. Someone not yet signed in
  // still signs in first: the launch rule sends them there.
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

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: space[4],
          paddingTop: space[6],
          paddingBottom: space[4],
        }}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}
          accessible
          accessibilityLabel="PesaIQ"
        >
          <Image
            source={MARK}
            style={{ width: LOGO, height: LOGO }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <Text variant="h3" style={{ fontFamily: fonts.heading }}>
            PesaIQ
          </Text>
        </View>

        <Preview />

        <View style={{ flex: 1, justifyContent: 'flex-end', paddingTop: space[6] }}>
          <Text variant="display" accessibilityRole="header">
            {WELCOME.title}
          </Text>
        </View>
      </ScrollView>

      <View style={{ paddingHorizontal: space[4], paddingBottom: space[4] }}>
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
            label={signedIn ? 'Skip to dashboard' : 'Skip to sign in'}
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

/**
 * A glimpse of Home, in its own tiles. The figures are invented and marked as
 * an example: nobody's records exist yet.
 */
function Preview() {
  return (
    <View
      accessible
      accessibilityLabel="An example of what PesaIQ shows: a financial health score of 76, Steady, and money received and spent."
      style={{ marginTop: space[6], gap: space[2] }}
    >
      <Tag label="Example" />
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View
          style={{
            flex: 1,
            backgroundColor: colors.accent2Ramp[200],
            borderRadius: radius.lg,
            padding: space[3],
            alignItems: 'center',
            justifyContent: 'center',
            gap: space[2],
          }}
        >
          <ScoreRing
            size={PREVIEW_RING}
            stroke={9}
            value={76}
            ink={colors.accent2Ramp[600]}
            trackInk={colors.accent2Ramp[400]}
          >
            <Text variant="h1" style={{ color: colors.accent2Ramp[900] }}>
              76
            </Text>
          </ScoreRing>
          <Text
            variant="bodyMedium"
            style={{ fontFamily: fonts.heading, color: colors.accent2Ramp[900] }}
          >
            Steady
          </Text>
        </View>
        <View style={{ flex: 1, gap: space[2] }}>
          <StatTile
            label="Received"
            value="1,250,000"
            icon="arrowIn"
            tint={money.in.tint}
            ink={money.in.ink}
            style={{ flexBasis: 'auto' }}
          />
          <StatTile
            label="Spent"
            value="486,500"
            icon="arrowOut"
            tint={money.out.tint}
            ink={money.out.ink}
            style={{ flexBasis: 'auto' }}
          />
        </View>
      </View>
    </View>
  );
}
