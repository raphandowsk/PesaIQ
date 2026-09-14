import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Text } from '../../components/ui';
import { normalizeTzMobile, phoneProblem, useAuthStore } from '../../features/auth';
import { useAppStore } from '../../features/transactions';
import { colors, fonts, MIN_TOUCH, radius, space } from '../../theme';

/**
 * Sign in, step 1: the mobile number. Any usual way of writing it is accepted
 * (0713..., 713..., +255 713..., 255713...). A code goes to it by SMS.
 */
export default function PhoneStep() {
  const requestCode = useAuthStore((s) => s.requestCode);
  const lastPhone = useAuthStore((s) => s.pending?.phone ?? null);
  // Someone who has seen the intro comes here directly, with nothing to go back to.
  const onboarded = useAppStore((s) => s.settings.onboardingComplete);

  const [value, setValue] = useState(() => (lastPhone ? lastPhone.slice(3) : ''));
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (sending) return;
    const problem = phoneProblem(value);
    const phone = normalizeTzMobile(value);
    if (problem || !phone) {
      setError(problem);
      return;
    }
    setSending(true);
    setError(null);
    const result = await requestCode(phone);
    setSending(false);
    if (result.ok) router.push('/code');
    else setError(result.message);
  };

  return (
    <OnboardingFrame
      backTo={onboarded ? undefined : '/how-it-works'}
      title="Your mobile number"
      subtitle="We'll send a 6-digit code by SMS. Your number is your PesaIQ account."
      footnote={
        <Text variant="small" tone="muted">
          Your number is used only to sign you in. Your messages stay on this phone.
        </Text>
      }
      cta={{ label: 'Send code', onPress: () => void send(), loading: sending }}
    >
      <View style={{ gap: space[2] }}>
        <Text variant="small" style={{ fontFamily: fonts.semibold }}>
          Mobile number
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          <View
            accessible
            accessibilityLabel="Country code plus 2 5 5"
            style={{
              minHeight: MIN_TOUCH,
              paddingHorizontal: space[4],
              borderRadius: radius.pill,
              backgroundColor: colors.neutralRamp[200],
              justifyContent: 'center',
            }}
          >
            <Text variant="bodyMedium" style={{ fontFamily: fonts.bold }}>
              +255
            </Text>
          </View>
          <TextInput
            value={value}
            onChangeText={(v) => {
              setValue(v);
              if (error) setError(null);
            }}
            onSubmitEditing={() => void send()}
            placeholder="712 345 678"
            placeholderTextColor={colors.neutralRamp[600]}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            returnKeyType="send"
            maxLength={16}
            autoFocus
            accessibilityLabel="Mobile number, after +255"
            style={{
              flex: 1,
              minHeight: MIN_TOUCH,
              borderWidth: 1,
              borderColor: error ? colors.accentRamp[500] : colors.neutralRamp[400],
              borderRadius: radius.pill,
              backgroundColor: colors.surface,
              paddingHorizontal: space[4],
              fontFamily: fonts.semibold,
              fontSize: 16,
              color: colors.text,
            }}
          />
        </View>
        {error ? (
          <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
    </OnboardingFrame>
  );
}
