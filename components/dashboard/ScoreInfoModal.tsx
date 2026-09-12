import { Modal, Pressable, ScrollView, View } from 'react-native';

import type { Health } from '../../features/insights';
import { colors, fonts, HIT_SLOP, radius, shadow, space } from '../../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';
import { ScoreBreakdown } from './ScoreBreakdown';

/** The dimmed page behind the window. */
const SCRIM = 'rgba(22,21,28,0.55)';
const CLOSE = 40;
const MAX_WIDTH = 560;

/**
 * "What builds your score", floating over Home. Opened from the health card;
 * closed with the close button, a tap outside, or Android's back button.
 */
export function ScoreInfoModal({
  visible,
  onClose,
  health,
  animate,
  replay,
}: {
  visible: boolean;
  onClose: () => void;
  health: Health;
  animate: boolean;
  /** Changes on each opening, so the bars grow again. */
  replay: number;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType={animate ? 'fade' : 'none'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, justifyContent: 'center', padding: space[4] }}>
        <Pressable
          onPress={onClose}
          accessible={false}
          importantForAccessibility="no"
          aria-hidden
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: SCRIM,
          }}
        />
        <View
          role="dialog"
          aria-modal
          accessibilityViewIsModal
          aria-label="What builds your score"
          style={[
            {
              width: '100%',
              maxWidth: MAX_WIDTH,
              maxHeight: '90%',
              alignSelf: 'center',
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              overflow: 'hidden',
            },
            shadow.sm,
          ]}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space[2],
              paddingLeft: space[4],
              paddingRight: space[2],
              paddingTop: space[2],
            }}
          >
            <Text
              variant="bodyMedium"
              accessibilityRole="header"
              style={{ flex: 1, fontFamily: fonts.heading, fontSize: 17 }}
            >
              What builds your score
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => ({
                width: CLOSE,
                height: CLOSE,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.neutralRamp[200] : 'transparent',
              })}
            >
              <Icon name="close" size={18} color={colors.neutralRamp[800]} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: space[4], paddingTop: space[2] }}>
            <ScoreBreakdown health={health} animate={animate} replay={replay} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
