import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect } from 'expo-router';

import type { Tip } from '../../features/insights';
import { colors, radius, space } from '../../theme';
import { indexAtOffset, nextIndex, TIP_AUTOPLAY_MS, TIP_RESUME_MS } from '../../utils/carousel';
import { useScreenReader } from '../../utils/useScreenReader';
import { Icon } from '../ui/Icon';
import { TipCard } from './TipCard';

const DOT = 8;
const DOT_ACTIVE = 20;
/** Dots sit in 24px-wide, 32px-tall targets so each is easy to tap. */
const DOT_PAD = 8;
const CONTROL = 32;

/**
 * One tip at a time: swipe between them, tap a dot, or let them move on by
 * themselves. Autoplay stays off with reduce motion or a screen reader, waits
 * after the user moves the tips, stops while Home is out of view, and can be
 * paused.
 */
export function TipCarousel({
  tips,
  tone,
  autoplay,
}: {
  tips: Tip[];
  tone: 'spend' | 'earn';
  autoplay: boolean;
}) {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const touchedAt = useRef(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(true);
  const screenReader = useScreenReader();

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const count = tips.length;
  const canPlay = autoplay && !screenReader && count > 1;
  const playing = canPlay && !paused && focused;

  const show = useCallback(
    (i: number, animated = true) => {
      indexRef.current = i;
      setIndex(i);
      scroller.current?.scrollTo({ x: i * width, animated });
    },
    [width],
  );

  // A shorter list after a record changes: start again from the first tip.
  useEffect(() => {
    if (indexRef.current >= count) show(0, false);
  }, [count, show]);

  // Keep the same tip in view when the width changes (rotation, a resized window).
  useEffect(() => {
    scroller.current?.scrollTo({ x: indexRef.current * width, animated: false });
  }, [width]);

  useEffect(() => {
    if (!playing || width === 0) return;
    const id = setInterval(() => {
      if (Date.now() - touchedAt.current < TIP_RESUME_MS) return;
      show(nextIndex(indexRef.current, count));
    }, TIP_AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing, width, count, show]);

  const touched = () => {
    touchedAt.current = Date.now();
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = indexAtOffset(e.nativeEvent.contentOffset.x, width, count);
    if (i !== indexRef.current) {
      indexRef.current = i;
      setIndex(i);
    }
  };

  const ink = tone === 'spend' ? colors.accentRamp[600] : colors.accent2Ramp[700];

  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width === 0 ? (
        <TipCard tip={tips[0]} tone={tone} />
      ) : (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollBeginDrag={touched}
          onTouchStart={touched}
        >
          {tips.map((tip, i) => (
            <View
              key={tip.title}
              // Only the tip in view is read out; the others are off to the side.
              aria-hidden={i !== index}
              importantForAccessibility={i === index ? 'auto' : 'no-hide-descendants'}
              style={{ width }}
            >
              <TipCard tip={tip} tone={tone} style={{ flex: 1 }} />
            </View>
          ))}
        </ScrollView>
      )}

      {count > 1 ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: space[1],
          }}
        >
          {tips.map((tip, i) => {
            const on = i === index;
            return (
              <Pressable
                key={tip.title}
                onPress={() => {
                  touched();
                  show(i);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Tip ${i + 1} of ${count}: ${tip.title}`}
                accessibilityState={{ selected: on }}
                aria-selected={on}
                style={{ height: CONTROL, justifyContent: 'center', paddingHorizontal: DOT_PAD }}
              >
                <View
                  style={{
                    width: on ? DOT_ACTIVE : DOT,
                    height: DOT,
                    borderRadius: radius.pill,
                    backgroundColor: on ? ink : colors.neutralRamp[400],
                  }}
                />
              </Pressable>
            );
          })}
          {canPlay ? (
            <Pressable
              onPress={() => setPaused((p) => !p)}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Play tips' : 'Pause tips'}
              style={({ pressed }) => ({
                width: CONTROL,
                height: CONTROL,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? colors.neutralRamp[200] : 'transparent',
              })}
            >
              <Icon name={paused ? 'play' : 'pause'} size={14} color={colors.neutralRamp[700]} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
