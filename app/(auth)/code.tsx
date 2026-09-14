import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { OnboardingFrame } from '../../components/onboarding/OnboardingFrame';
import { Text, toast } from '../../components/ui';
import { formatTzMobile, formatWait, resendWait, useAuthStore } from '../../features/auth';
import { colors, fonts, HIT_SLOP, MIN_TOUCH, radius, space } from '../../theme';

const CODE_LENGTH = 6;

/**
 * Sign in, step 2: the code sent by SMS. It is checked as soon as all six
 * digits are in (phones can fill it in from the message). A new code can be
 * asked for once a minute.
 */
export default function CodeStep() {
  const pending = useAuthStore((s) => s.pending);
  const verifyCode = useAuthStore((s) => s.verifyCode);
  const requestCode = useAuthStore((s) => s.requestCode);

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reopened without a code on the way (the app restarted): start again.
  if (!pending) return <Redirect href="/phone" />;

  const wait = resendWait(pending.sentAt, now);

  const check = async (value: string) => {
    if (checking) return;
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(value)) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    setChecking(true);
    setError(null);
    const result = await verifyCode(value);
    if (result.ok) {
      // The launch rule decides what comes next: onboarding, or the app.
      router.replace('/');
      return;
    }
    setChecking(false);
    setCode('');
    setError(result.message);
  };

  const onChange = (typed: string) => {
    const digits = typed.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH) void check(digits);
  };

  const resend = async () => {
    setResending(true);
    setError(null);
    const result = await requestCode(pending.phone);
    setResending(false);
    if (result.ok) {
      setCode('');
      toast('A new code is on its way.');
    } else {
      setError(result.message);
    }
  };

  return (
    <OnboardingFrame
      backTo="/phone"
      title="Enter the code"
      subtitle={`We sent a 6-digit code by SMS to ${formatTzMobile(pending.phone)}.`}
      cta={{ label: 'Continue', onPress: () => void check(code), loading: checking }}
    >
      <View style={{ gap: space[3] }}>
        <TextInput
          value={code}
          onChangeText={onChange}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={CODE_LENGTH}
          autoFocus
          editable={!checking}
          accessibilityLabel="6-digit code"
          placeholder="000000"
          placeholderTextColor={colors.neutralRamp[400]}
          style={{
            minHeight: 64,
            borderWidth: 1,
            borderColor: error ? colors.accentRamp[500] : colors.neutralRamp[400],
            borderRadius: radius.lg,
            backgroundColor: colors.surface,
            textAlign: 'center',
            fontFamily: fonts.heading,
            fontSize: 28,
            letterSpacing: 10,
            color: colors.text,
          }}
        />

        {error ? (
          <Text variant="small" tone="accent" accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: space[2],
          }}
        >
          {wait > 0 ? (
            <Text variant="small" tone="muted" accessibilityLiveRegion="none">
              New code in {formatWait(wait)}
            </Text>
          ) : (
            <LinkButton
              label={resending ? 'Sending…' : 'Send a new code'}
              disabled={resending}
              onPress={() => void resend()}
            />
          )}
          <LinkButton label="Change number" onPress={() => router.replace('/phone')} />
        </View>
      </View>
    </OnboardingFrame>
  );
}

function LinkButton({
  label,
  onPress,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
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
