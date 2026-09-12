import { AccessibilityInfo, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius, shadow, space } from '../../theme';
import { Icon } from './Icon';
import { Text } from './Text';

/** How long a toast stays up — the design's timing. */
export const TOAST_MS = 2400;

interface ToastState {
  message: string | null;
  show(message: string): void;
  hide(): void;
}

let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show(message) {
    if (timer) clearTimeout(timer);
    set({ message });
    // Toasts are visual; say it too, so a screen-reader user hears the outcome.
    AccessibilityInfo.announceForAccessibility(message);
    timer = setTimeout(() => {
      timer = null;
      set({ message: null });
    }, TOAST_MS);
  },
  hide() {
    if (timer) clearTimeout(timer);
    timer = null;
    set({ message: null });
  },
}));

/** Show a short confirmation from anywhere, including outside React. */
export const toast = (message: string) => useToastStore.getState().show(message);

/** Keeps the toast clear of the tab bar. */
const TAB_BAR_CLEARANCE = 72;
const TOAST_LAYER = 1000;

/** Rendered once, at the root. Never intercepts touches. */
export function Toast() {
  const message = useToastStore((s) => s.message);
  const insets = useSafeAreaInsets();

  if (!message) return null;

  return (
    <View
      style={{
        pointerEvents: 'none',
        position: 'absolute',
        // Above any screen: without it, a pushed screen (Export, on web) can
        // paint over the toast and the confirmation is never seen.
        zIndex: TOAST_LAYER,
        left: space[4],
        right: space[4],
        bottom: insets.bottom + TAB_BAR_CLEARANCE,
        alignItems: 'center',
      }}
    >
      <View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: space[2],
            backgroundColor: colors.neutralRamp[900],
            borderRadius: radius.pill,
            paddingVertical: space[3],
            paddingHorizontal: space[4],
          },
          shadow.lg,
        ]}
      >
        <Icon name="check" size={17} strokeWidth={3.2} color={colors.accent2Ramp[400]} />
        <Text variant="smallMedium" style={{ color: colors.surface, flexShrink: 1 }}>
          {message}
        </Text>
      </View>
    </View>
  );
}
