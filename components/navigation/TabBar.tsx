import type { BottomTabBarProps } from 'expo-router/tabs';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppStore } from '../../features/transactions';
import { colors, radius, space } from '../../theme';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';

/** Route name -> how the design labels and draws it. */
const TABS: Record<string, { label: string; icon: IconName }> = {
  dashboard: { label: 'Home', icon: 'home' },
  transactions: { label: 'Records', icon: 'records' },
  'parser-lab': { label: 'Lab', icon: 'lab' },
  review: { label: 'Review', icon: 'review' },
  settings: { label: 'Settings', icon: 'settings' },
};

// Geometry from the design's bottom nav.
const ITEM_HEIGHT = 56;
const PILL = { width: 46, height: 26 };
const BADGE_SIZE = 15;

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

/**
 * The bottom navigation.
 *
 * Custom rather than the stock bar because the design puts a tinted pill behind
 * the active icon and a count badge on Review, neither of which the default
 * draws. Tap semantics follow React Navigation's contract (emit `tabPress`,
 * respect `preventDefault`), so a screen can still intercept a tap.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const reviewCount = useAppStore(
    (s) => s.transactions.filter((t) => t.status === 'NEEDS_REVIEW').length,
  );

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.divider,
        paddingTop: space[1],
        paddingHorizontal: space[1],
        paddingBottom: Math.max(insets.bottom, space[1]),
      }}
    >
      {state.routes.map((route, index) => {
        const meta = TABS[route.name];
        if (!meta) return null;

        const focused = state.index === index;
        const ink = focused ? colors.accentRamp[800] : colors.neutralRamp[700];
        const badge = route.name === 'review' && reviewCount > 0 ? badgeText(reviewCount) : null;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={
              badge ? `${meta.label}, ${reviewCount} waiting for review` : meta.label
            }
            style={({ pressed }) => ({
              flex: 1,
              minHeight: ITEM_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              borderRadius: radius.md,
              backgroundColor: pressed ? colors.neutralRamp[200] : 'transparent',
            })}
          >
            <View
              style={{
                ...PILL,
                borderRadius: radius.pill,
                backgroundColor: focused ? colors.accentRamp[200] : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={meta.icon} size={19} color={ink} />
              {badge ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -1,
                    right: 6,
                    minWidth: BADGE_SIZE,
                    height: BADGE_SIZE,
                    borderRadius: radius.pill,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                  }}
                >
                  <Text variant="badge" tone="inverse">
                    {badge}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="tabLabel" style={{ color: ink }}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
