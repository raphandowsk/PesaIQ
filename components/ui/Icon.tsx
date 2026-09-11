import type { ReactNode } from 'react';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { colors } from '../../theme';

/**
 * The design's own glyphs.
 *
 * The paths are copied from the design canvas rather than taken from an icon
 * library. The canvas draws its icons by hand — no Lucide, no icon font — so a
 * library would be close but visibly off. Every glyph is 24x24, stroked and
 * round-capped, at the canvas's heavier 2.75 stroke.
 */
export type IconName =
  | 'back'
  | 'shield'
  | 'check'
  | 'home'
  | 'records'
  | 'lab'
  | 'review'
  | 'settings'
  | 'warning'
  | 'caution'
  | 'chevronDown';

const GLYPHS: Record<IconName, ReactNode> = {
  back: (
    <>
      <Path d="M11 6l-6 6 6 6" />
      <Path d="M5 12h14" />
    </>
  ),
  shield: <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  check: <Path d="M5 13l4 4 10-10" />,
  home: (
    <>
      <Rect x="3" y="3" width="7" height="9" rx="2" />
      <Rect x="14" y="3" width="7" height="5" rx="2" />
      <Rect x="14" y="12" width="7" height="9" rx="2" />
      <Rect x="3" y="16" width="7" height="5" rx="2" />
    </>
  ),
  records: (
    <>
      <Path d="M4 6h16" />
      <Path d="M4 12h16" />
      <Path d="M4 18h10" />
    </>
  ),
  lab: (
    <>
      <Path d="M4 5h16v10H8l-4 4z" />
      <Path d="M12 8v4" />
      <Path d="M10 10h4" />
    </>
  ),
  review: (
    <>
      <Path d="M20 12a8 8 0 1 1-3-6.2" />
      <Path d="M9 12l3 3 8-8" />
    </>
  ),
  settings: (
    <>
      <Circle cx="12" cy="12" r="3" />
      <Path d="M12 3v2" />
      <Path d="M12 19v2" />
      <Path d="M3 12h2" />
      <Path d="M19 12h2" />
      <Path d="M5.6 5.6l1.5 1.5" />
      <Path d="M16.9 16.9l1.5 1.5" />
      <Path d="M18.4 5.6l-1.5 1.5" />
      <Path d="M7.1 16.9l-1.5 1.5" />
    </>
  ),
  // Full warning triangle with a dot: the Lab's error note.
  warning: (
    <>
      <Path d="M12 4l9 16H3z" />
      <Path d="M12 10v4" />
      <Path d="M12 17h.01" />
    </>
  ),
  // Compact triangle for the per-field "check" badge.
  caution: (
    <>
      <Path d="M12 4l9 16H3z" />
      <Path d="M12 11v3" />
    </>
  ),
  chevronDown: <Path d="M6 9l6 6 6-6" />,
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

/**
 * Decorative by default: hidden from screen readers, because every icon in the
 * design sits beside a text label or inside a control that carries its own.
 */
export function Icon({ name, size = 20, color = colors.text, strokeWidth = 2.75 }: IconProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <G
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {GLYPHS[name]}
      </G>
    </Svg>
  );
}
