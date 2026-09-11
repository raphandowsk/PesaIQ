import { Pressable } from 'react-native';

import { colors, HIT_SLOP, radius } from '../../theme';
import { Icon } from './Icon';

const SIZE = 44;

/**
 * The design's round Back button. Visually 44px; the hit slop takes the touch
 * target past the 48px Android minimum.
 */
export function BackButton({ onPress, label = 'Back' }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: SIZE,
        height: SIZE,
        borderRadius: radius.pill,
        backgroundColor: pressed ? colors.neutralRamp[300] : colors.neutralRamp[200],
        alignItems: 'center',
        justifyContent: 'center',
      })}
    >
      <Icon name="back" />
    </Pressable>
  );
}
