import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, HIT_SLOP, radius, space } from '../../theme';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export interface OnboardingFrameProps {
  /** Where Back goes if there is no history to pop — e.g. after a deep link. */
  backTo?: Href;
  /** Decoration above the title, such as the privacy shield. */
  badge?: ReactNode;
  title: string;
  subtitle?: string;
  children: ReactNode;
  cta: { label: string; onPress: () => void; loading?: boolean };
  /** Pinned just above the call to action. */
  footnote?: ReactNode;
}

const BACK_SIZE = 44;

/**
 * Shared shell for onboarding steps 2-4: round Back button, title block,
 * scrolling content, and a call to action pinned to the bottom so it never
 * scrolls away on a small phone.
 */
export function OnboardingFrame({
  backTo,
  badge,
  title,
  subtitle,
  children,
  cta,
  footnote,
}: OnboardingFrameProps) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else if (backTo) router.replace(backTo);
  };

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {/* Keeps the call to action above the keyboard on the sign-in steps. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: space[4],
            paddingTop: space[4],
            paddingBottom: space[4],
          }}
          showsVerticalScrollIndicator={false}
        >
          {backTo ? (
            <Pressable
              onPress={goBack}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Back"
              style={({ pressed }) => ({
                width: BACK_SIZE,
                height: BACK_SIZE,
                borderRadius: radius.pill,
                backgroundColor: pressed ? colors.neutralRamp[300] : colors.neutralRamp[200],
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: space[4],
              })}
            >
              <Icon name="back" />
            </Pressable>
          ) : null}

          {badge}

          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="body" tone="muted" style={{ marginTop: space[1] }}>
              {subtitle}
            </Text>
          ) : null}

          <View style={{ flex: 1, marginTop: space[4] }}>{children}</View>
        </ScrollView>

        <View style={{ paddingHorizontal: space[4], paddingBottom: space[4], gap: space[3] }}>
          {footnote}
          <Button label={cta.label} size="lg" onPress={cta.onPress} loading={cta.loading} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
