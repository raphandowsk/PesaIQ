import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { PinInput } from '../../components/pin/PinInput';
import { ConfirmPanel } from '../../components/settings/SettingsList';
import { Text } from '../../components/ui';
import { useAuthStore } from '../../features/auth';
import { PIN_LENGTH, retryText, usePinStore } from '../../features/pin';
import { colors, fonts, HIT_SLOP, MIN_TOUCH, space } from '../../theme';

/**
 * Signing in on a phone that doesn't hold the account key yet: the PIN opens
 * it. Wrong guesses are counted by the server: five tries, then waits.
 */
export default function UnlockPin() {
  const unlock = usePinStore((s) => s.unlock);
  const startOver = usePinStore((s) => s.startOver);
  const signOut = useAuthStore((s) => s.signOut);

  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const waiting = retryAt != null && Date.parse(retryAt) > now;

  useEffect(() => {
    if (!retryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [retryAt]);

  const submit = async (pin: string) => {
    if (busy || waiting) return;
    setBusy(true);
    setError(null);
    const result = await unlock(pin);
    if (result.ok) {
      router.replace('/');
      return;
    }
    setBusy(false);
    setValue('');
    setError(result.message);
    if (result.retryAt) setRetryAt(result.retryAt);
  };

  const onChange = (digits: string) => {
    setValue(digits);
    if (error && !waiting) setError(null);
    if (digits.length === PIN_LENGTH) void submit(digits);
  };

  const confirmStartOver = async () => {
    setBusy(true);
    const result = await startOver();
    setBusy(false);
    if (result.ok) router.replace('/');
    else setError(result.message);
  };

  const differentNumber = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <OnboardingFrame
      title="Enter your PIN"
      subtitle="Your account has a PIN. Enter it to unlock your records on this phone."
      cta={{ label: 'Unlock', onPress: () => void submit(value), loading: busy && !resetting }}
    >
      <View style={{ gap: space[3] }}>
        <PinInput
          value={value}
          onChange={onChange}
          label="Your 4-digit PIN"
          disabled={busy || waiting || resetting}
          invalid={error != null}
        />
        {error ? (
          <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
            {waiting && retryAt ? `Too many tries. ${retryText(retryAt, now)}` : error}
          </Text>
        ) : null}

        {resetting ? (
          <ConfirmPanel
            message="Start over with a new PIN? Records synced to your account are deleted from PesaIQ's server and can't be recovered. Records on this phone are kept."
            confirmLabel="Delete and start over"
            busy={busy}
            onConfirm={() => void confirmStartOver()}
            onCancel={() => setResetting(false)}
          />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>
            <LinkButton label="Forgot PIN?" onPress={() => setResetting(true)} disabled={busy} />
            <LinkButton
              label="Use a different number"
              onPress={() => void differentNumber()}
              disabled={busy}
            />
          </View>
        )}
      </View>
    </OnboardingFrame>
  );
}

function LinkButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: MIN_TOUCH,
        justifyContent: 'center',
        opacity: pressed || disabled ? 0.6 : 1,
      })}
    >
      <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.accentRamp[700] }}>
        {label}
      </Text>
    </Pressable>
  );
}
