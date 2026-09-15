import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

/** Ticks around the track; what is still to earn reads as a dial. */
const TICKS = 60;
const TICK_LENGTH = 1.8;

export interface ScoreRingProps {
  size: number;
  /** The score arc's width. The ticks are a little over half of it. */
  stroke: number;
  /** 0-100: how much of the ring the arc covers. */
  value: number;
  ink: string;
  trackInk: string;
  /** Drawn in the middle: the score itself. */
  children?: ReactNode;
}

/**
 * The health score ring: a solid, round-capped arc for the score over a
 * ticked track.
 *
 * The arc follows `value` by re-rendering rather than animating an SVG prop:
 * on web, Animated forwards `collapsable` onto the DOM <circle>.
 */
export function ScoreRing({ size, stroke, value, ink, trackInk, children }: ScoreRingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const shown = Math.min(100, Math.max(0, value));
  const gap = circumference / TICKS - TICK_LENGTH;

  return (
    <View style={{ width: size, height: size }}>
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={trackInk}
            strokeWidth={stroke * 0.6}
            strokeDasharray={`${TICK_LENGTH} ${gap}`}
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ink}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - shown / 100)}
          />
        </Svg>
      </View>
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}
