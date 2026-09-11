import { colors, money, radius, space, type } from '../theme';

/**
 * Phase 1A guard: the tokens must match the design canvas exactly. If a value
 * here changes, it should be because the design changed — not by accident.
 */
describe('theme tokens match the design canvas', () => {
  it('carries the violet/lime palette', () => {
    expect(colors.bg).toBe('#f7f6fc');
    expect(colors.surface).toBe('#ffffff');
    expect(colors.text).toBe('#16151c');
    expect(colors.accent).toBe('#8a4fd8');
    expect(colors.accent2).toBe('#6aad39');
  });

  it('exposes full 100-900 ramps', () => {
    expect(colors.accentRamp[100]).toBe('#f8f1ff');
    expect(colors.accentRamp[900]).toBe('#33165a');
    expect(colors.accent2Ramp[100]).toBe('#f2fbe7');
    expect(colors.accent2Ramp[900]).toBe('#233d12');
  });

  it('tints incoming money lime and outgoing violet', () => {
    expect(money.in.tint).toBe(colors.accent2Ramp[200]);
    expect(money.out.tint).toBe(colors.accentRamp[200]);
  });

  it('uses the revised integer spacing and radius scales', () => {
    expect(space).toMatchObject({ 1: 4, 2: 8, 3: 12, 4: 18, 6: 26, 8: 36 });
    expect(radius).toMatchObject({ sm: 12, md: 20, lg: 30 });
  });

  it('sets headings in Plus Jakarta Sans ExtraBold', () => {
    expect(type.display.fontFamily).toBe('PlusJakartaSans_800ExtraBold');
    expect(type.body.fontFamily).toBe('PlusJakartaSans_400Regular');
  });
});
