import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { PinInput } from '../../components/pin/PinInput';
import { Text } from '../../components/ui';
import { useAuthStore } from '../../features/auth';
import { PIN_LENGTH, pinProblem, usePinStore } from '../../features/pin';
import { colors, fonts, HIT_SLOP, MIN_TOUCH, space } from '../../theme';

type Stage = 'choose' | 'confirm';

/**
 * A new account's PIN: chosen, then entered again. It locks the account key
 * that will protect synced records. It is never sent anywhere as it is typed.
 */
export default function CreatePin() {
  const create = usePinStore((s) => s.create);
  const signOut = useAuthStore((s) => s.signOut);

  const [stage, setStage] = useState<Stage>('choose');
  const [first, setFirst] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const restart = (message: string) => {
    setStage('choose');
    setFirst('');
    setValue('');
    setError(message);
  };

  const submit = async (pin: string) => {
    if (busy) return;
    if (stage === 'choose') {
      const problem = pinProblem(pin);
      if (problem) {
        setValue('');
        setError(problem);
        return;
      }
      setFirst(pin);
      setValue('');
      setError(null);
      setStage('confirm');
      return;
    }
    if (pin !== first) {
      restart("The PINs didn't match. Choose your PIN again.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await create(pin);
    if (result.ok) {
      router.replace('/');
      return;
    }
    setBusy(false);
    restart(result.message);
  };

  const onChange = (digits: string) => {
    setValue(digits);
    if (error) setError(null);
    if (digits.length === PIN_LENGTH) void submit(digits);
  };

  const differentNumber = async () => {
    await signOut();
    router.replace('/');
  };

  return (
    <OnboardingFrame
      title={stage === 'choose' ? 'Create your PIN' : 'Enter your PIN again'}
      subtitle={
        stage === 'choose'
          ? '4 digits that unlock your records on any phone you sign in on.'
          : 'Just to make sure it is right.'
      }
      footnote={
        <Text variant="small" tone="muted">
          Your PIN never leaves this phone, and PesaIQ can&apos;t recover it. If you forget it,
          records synced to your account can&apos;t be opened. The ones on this phone stay.
        </Text>
      }
      cta={{
        label: stage === 'choose' ? 'Continue' : 'Create PIN',
        onPress: () => void submit(value),
        loading: busy,
      }}
    >
      <View style={{ gap: space[3] }}>
        <PinInput
          key={stage}
          value={value}
          onChange={onChange}
          label={stage === 'choose' ? 'New 4-digit PIN' : 'The same PIN again'}
          disabled={busy}
          invalid={error != null}
        />
        {error ? (
          <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
        <Pressable
          onPress={() => void differentNumber()}
          disabled={busy}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Use a different number"
          style={({ pressed }) => ({
            minHeight: MIN_TOUCH,
            justifyContent: 'center',
            alignSelf: 'flex-start',
            opacity: pressed || busy ? 0.6 : 1,
          })}
        >
          <Text variant="small" style={{ fontFamily: fonts.bold, color: colors.accentRamp[700] }}>
            Use a different number
          </Text>
        </Pressable>
      </View>
    </OnboardingFrame>
  );
}
