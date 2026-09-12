import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { Button, Screen, Text, Toast } from '../components/ui';
import { useAppStore } from '../features/transactions';
import { colors, space } from '../theme';

// Hold the native splash until fonts and the database are both ready, so the
// first painted frame is the right screen in the right face.
void SplashScreen.preventAutoHideAsync();

/**
 * Anything a screen throws while rendering lands here instead of a blank
 * screen. The error's own text is not shown: it could quote a pasted message.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
          <Text variant="h3" accessibilityRole="header">
            Something went wrong
          </Text>
          <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
            This screen hit a problem it could not recover from. Your saved records are not
            affected.
          </Text>
          <Button label="Try again" onPress={() => void retry()} />
        </View>
      </Screen>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  const ready = useAppStore((s) => s.ready);
  const error = useAppStore((s) => s.error);
  const initialize = useAppStore((s) => s.initialize);
  const onboarded = useAppStore((s) => s.settings.onboardingComplete);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  // A font failure still lets the app start, in a fallback face; a stuck
  // splash would be worse.
  const fontsSettled = fontsLoaded || fontError != null;
  const storeSettled = ready || error != null;

  useEffect(() => {
    if (fontsSettled && storeSettled) void SplashScreen.hideAsync();
  }, [fontsSettled, storeSettled]);

  if (!fontsSettled) return null;

  if (!ready) {
    return (
      <SafeAreaProvider>
        <Boot error={error} onRetry={() => void initialize()} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* Always reachable: decides where a launch lands (see app/index.tsx). */}
        <Stack.Screen name="index" />

        {/*
          The guards make the rule structural. Onboarding cannot be reached by
          Back once finished, and the tabs cannot be deep-linked into before.
        */}
        <Stack.Protected guard={!onboarded}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={onboarded}>
          <Stack.Screen name="(tabs)" />
          {/* Pushed over the tabs from the Parser Lab; no tab bar. */}
          <Stack.Screen name="result" />
          <Stack.Screen name="transactions/[id]" />
          {/* Pushed from Settings -> Export my data. */}
          <Stack.Screen name="export" />
          {/* Pushed from Home's Fees & taxes card. */}
          <Stack.Screen name="fees" />
        </Stack.Protected>
      </Stack>
      <Toast />
    </SafeAreaProvider>
  );
}

/** Shown only if opening the database is slow or fails. */
function Boot({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        {error ? (
          <>
            <Text variant="h3" accessibilityRole="header">
              Could not open your records
            </Text>
            <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
              {error}
            </Text>
            <Button label="Try again" onPress={onRetry} />
          </>
        ) : (
          <>
            <ActivityIndicator color={colors.accent} />
            <Text variant="small" tone="muted">
              Opening PesaIQ
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
