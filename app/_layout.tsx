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
import { accessFor, useAuthStore } from '../features/auth';
import { usePinStore } from '../features/pin';
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
  const authStatus = useAuthStore((s) => s.status);
  const initializeAuth = useAuthStore((s) => s.initialize);
  const userId = useAuthStore((s) => s.session?.userId ?? null);
  const pinStatus = usePinStore((s) => s.status);
  const pinUser = usePinStore((s) => s.userId);
  const checkPin = usePinStore((s) => s.check);
  const resetPin = usePinStore((s) => s.reset);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  // Signed in: find out whether this phone holds the account key. Signed out:
  // forget the key's state (the key itself is removed by Sign out).
  useEffect(() => {
    if (authStatus === 'signedIn' && userId && pinUser !== userId) void checkPin(userId);
    if (authStatus === 'signedOut' && pinUser) resetPin();
  }, [authStatus, userId, pinUser, checkPin, resetPin]);

  const signedIn = authStatus === 'signedIn';

  // A font failure still lets the app start, in a fallback face; a stuck
  // splash would be worse.
  const fontsSettled = fontsLoaded || fontError != null;
  const storeSettled = ready || error != null;
  const authSettled = authStatus !== 'loading';
  const pinSettled = !signedIn || (pinStatus !== 'idle' && pinStatus !== 'checking');

  useEffect(() => {
    if (fontsSettled && storeSettled && authSettled && pinSettled) void SplashScreen.hideAsync();
  }, [fontsSettled, storeSettled, authSettled, pinSettled]);

  if (!fontsSettled) return null;

  if (!ready || !authSettled || !pinSettled) {
    return (
      <SafeAreaProvider>
        <Boot error={error} onRetry={() => void initialize()} />
      </SafeAreaProvider>
    );
  }

  if (authStatus === 'unavailable') {
    return (
      <SafeAreaProvider>
        <SignInMissing />
      </SafeAreaProvider>
    );
  }

  if (signedIn && pinStatus === 'offline') {
    return (
      <SafeAreaProvider>
        <Offline onRetry={() => userId && void checkPin(userId)} />
      </SafeAreaProvider>
    );
  }

  const access = accessFor(signedIn, pinStatus === 'ready', onboarded);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* Always reachable: decides where a launch lands (see app/index.tsx). */}
        <Stack.Screen name="index" />

        {/*
          The guards make the rule structural (features/auth/routing.ts): the
          app needs an account, sign-in closes once signed in, and onboarding
          cannot be reached by Back once finished.
        */}
        <Stack.Protected guard={access.intro}>
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
        <Stack.Protected guard={access.signIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={access.pin}>
          <Stack.Screen name="(pin)" />
        </Stack.Protected>
        <Stack.Protected guard={access.app}>
          <Stack.Screen name="(tabs)" />
          {/* Pushed over the tabs from the Parser Lab; no tab bar. */}
          <Stack.Screen name="result" />
          <Stack.Screen name="transactions/[id]" />
          {/* Pushed from Settings -> Export my data. */}
          <Stack.Screen name="export" />
          {/* Pushed from Home's Fees & taxes card. */}
          <Stack.Screen name="fees" />
          {/* Pushed from Home's Monthly report card and the Records header. */}
          <Stack.Screen name="reports" />
        </Stack.Protected>
      </Stack>
      <Toast />
    </SafeAreaProvider>
  );
}

/** Signed in, but the account key could not be looked up. */
function Offline({ onRetry }: { onRetry: () => void }) {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        <Text variant="h3" accessibilityRole="header">
          Couldn&apos;t reach PesaIQ
        </Text>
        <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
          Check your connection, then try again. Your records on this phone are safe.
        </Text>
        <Button label="Try again" onPress={onRetry} />
      </View>
    </Screen>
  );
}

/** A build made without the Supabase settings: nobody could sign in. */
function SignInMissing() {
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
        <Text variant="h3" accessibilityRole="header">
          Sign-in isn&apos;t set up
        </Text>
        <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
          This copy of PesaIQ was built without its Supabase settings, so no one can sign in. Add
          them to .env (see .env.example) and start the app again.
        </Text>
      </View>
    </Screen>
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
