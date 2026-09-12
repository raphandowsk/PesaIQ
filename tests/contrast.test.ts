import { colors, money, textFaint, textMuted } from '../theme';

/**
 * WCAG 2.1 contrast for every text-on-background pair the app draws. Small
 * text needs 4.5:1 (AA). If a token or a component's colors change, the pair
 * belongs here too.
 */
type Rgb = [number, number, number];

const hex = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** A colour as drawn on `over`: rgba() values are blended the way screens paint them. */
function paint(color: string, over: string): Rgb {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(color);
  if (!m) return hex(color);
  const ground = hex(over);
  const alpha = Number(m[4]);
  return [1, 2, 3].map((i, k) => Math.round(Number(m[i]) * alpha + ground[k] * (1 - alpha))) as Rgb;
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(fg: string, bg: string): number {
  const a = luminance(paint(fg, bg));
  const b = luminance(hex(bg));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const AA = 4.5;

const GROUNDS: [string, string][] = [
  ['page ground', colors.bg],
  ['cards', colors.surface],
  ['neutral panels', colors.neutralRamp[200]],
  ['violet confirm panels', colors.accentRamp[100]],
  ['violet tints', colors.accentRamp[200]],
  ['lime tints', colors.accent2Ramp[200]],
];

describe('contrast', () => {
  it('computes the WCAG reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it.each(GROUNDS)('body, muted and faint text reach AA on %s', (_, ground) => {
    for (const fg of [colors.text, textMuted, textFaint]) {
      expect(contrast(fg, ground)).toBeGreaterThanOrEqual(AA);
    }
  });

  it.each([
    ['primary button label', colors.surface, colors.accent],
    ['primary button, pressed', colors.surface, colors.accentRamp[700]],
    ['positive button label', colors.surface, colors.accent2Ramp[700]],
    ['danger and ghost labels', colors.accentRamp[700], colors.bg],
    ['secondary button label', colors.neutralRamp[700], colors.bg],
    ['selected lime chip', colors.accent2Ramp[900], colors.accent2Ramp[500]],
    ['links and accent text', colors.accentRamp[700], colors.surface],
    ['missing values and placeholders', colors.neutralRamp[700], colors.bg],
    ['incoming amounts on cards', money.in.amount, colors.surface],
    ['toast', colors.surface, colors.neutralRamp[900]],
    ['active tab', colors.accentRamp[800], colors.surface],
    ['inactive tab', colors.neutralRamp[700], colors.surface],
    ['tab badge', colors.surface, colors.accent],
    ['neutral tag', colors.neutralRamp[700], colors.neutralRamp[200]],
    ['positive tag', colors.accent2Ramp[800], colors.accent2Ramp[100]],
    ['accent tag', colors.accentRamp[800], colors.accentRamp[100]],
    ['confidence pill', colors.accentRamp[800], colors.accentRamp[200]],
    ['confirmed pill', colors.accent2Ramp[900], colors.accent2Ramp[300]],
    ['needs-review pill', colors.accentRamp[900], colors.accentRamp[300]],
  ])('%s reaches AA', (_, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA);
  });
});
