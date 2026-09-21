import { useEffect, useState } from 'react';
import {
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import MARK from '../../assets/images/mark.png';
import { useAuthStore } from '../../features/auth';
import { PIN_LENGTH, retryText, usePinStore } from '../../features/pin';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, HIT_SLOP, MIN_TOUCH, space } from '../../theme';
import { ConfirmPanel } from '../settings/SettingsList';
import { Button, Text } from '../ui';
import { PinInput } from './PinInput';

/**
 * The app lock, over everything, until the PIN is entered: each time PesaIQ is
 * opened, and when it comes back after a while in the background. The screens
 * underneath stay as they were, so unlocking returns to the same place.
 */
export function LockScreen({ visible }: { visible: boolean }) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      // Android Back leaves the app rather than reaching the screens underneath.
      onRequestClose={() => BackHandler.exitApp()}
    >
      {visible ? <LockForm /> : null}
    </Modal>
  );
}

function LockForm() {
  const openLock = usePinStore((s) => s.openLock);
  const storedRetryAt = usePinStore((s) => s.lockRetryAt);
  const signOut = useAuthStore((s) => s.signOut);
  const name = useAppStore((s) => s.displayName);
  const insets = useSafeAreaInsets();

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const retryAt = storedRetryAt;
  const waiting = retryAt != null && Date.parse(retryAt) > now;

  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);

  const submit = async (pin: string) => {
    if (busy || waiting || pin.length !== PIN_LENGTH) return;
    setBusy(true);
    setError(null);
    const result = await openLock(pin);
    setBusy(false);
    if (result.ok) return;
    setValue('');
    setNow(Date.now());
    setError(result.message);
  };

  const onChange = (digits: string) => {
    setValue(digits);
    if (error && !waiting) setError(null);
    if (digits.length === PIN_LENGTH) void submit(digits);
  };

  // Signing out removes the key from this phone; signing in again (a code by
  // SMS) leads to the PIN screen, where "Forgot PIN?" starts over.
  const signOutToReset = async () => {
    setBusy(true);
    const result = await signOut();
    setBusy(false);
    if (result.ok) router.replace('/');
    else setError(result.message);
  };

  const message = waiting && retryAt ? `Too many tries. ${retryText(retryAt, now)}` : error;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'center',
          paddingTop: insets.top + space[6],
          paddingBottom: insets.bottom + space[6],
          paddingLeft: insets.left + space[4],
          paddingRight: insets.right + space[4],
          gap: space[6],
        }}
      >
        <View style={{ alignItems: 'center', gap: space[3] }}>
          <Image
            source={MARK}
            style={{ width: 88, height: 83 }}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
            accessible={false}
          />
          <Text variant="h2" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {name ? `Welcome back, ${name}` : 'Welcome back'}
          </Text>
          <Text variant="small" tone="muted" style={{ textAlign: 'center' }}>
            Enter your PIN to open PesaIQ.
          </Text>
        </View>

        <View style={{ gap: space[3], width: '100%', maxWidth: 360, alignSelf: 'center' }}>
          <PinInput
            value={value}
            onChange={onChange}
            label="Your 4-digit PIN"
            disabled={busy || waiting || forgot}
            invalid={message != null}
          />
          {message ? (
            <Text
              variant="small"
              tone="accent"
              accessibilityLiveRegion="polite"
              style={{ textAlign: 'center' }}
            >
              {message}
            </Text>
          ) : null}

          {forgot ? (
            <ConfirmPanel
              message="Sign out to reset your PIN? You'll sign in again with a code sent by SMS, then choose “Forgot PIN?” to set a new one."
              confirmLabel="Sign out"
              busy={busy}
              onConfirm={() => void signOutToReset()}
              onCancel={() => setForgot(false)}
            />
          ) : (
            <>
              <Button
                label="Unlock"
                onPress={() => void submit(value)}
                loading={busy}
                disabled={waiting || value.length !== PIN_LENGTH}
              />
              <Pressable
                onPress={() => setForgot(true)}
                disabled={busy}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Forgot PIN?"
                style={({ pressed }) => ({
                  minHeight: MIN_TOUCH,
                  alignSelf: 'center',
                  justifyContent: 'center',
                  opacity: pressed || busy ? 0.6 : 1,
                })}
              >
                <Text
                  variant="small"
                  style={{ fontFamily: fonts.bold, color: colors.accentRamp[700] }}
                >
                  Forgot PIN?
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
