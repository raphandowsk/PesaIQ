import { indexAtOffset, nextIndex, TIP_AUTOPLAY_MS, TIP_RESUME_MS } from '../utils/carousel';

describe('tip carousel paging', () => {
  it('moves to the next tip, and back to the first after the last', () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(2, 3)).toBe(0);
    expect(nextIndex(0, 1)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });

  it('finds the page nearest a scroll offset', () => {
    expect(indexAtOffset(0, 340, 3)).toBe(0);
    expect(indexAtOffset(169, 340, 3)).toBe(0);
    expect(indexAtOffset(171, 340, 3)).toBe(1);
    expect(indexAtOffset(680, 340, 3)).toBe(2);
  });

  it('stays within the list, whatever the offset', () => {
    expect(indexAtOffset(-50, 340, 3)).toBe(0);
    expect(indexAtOffset(5000, 340, 3)).toBe(2);
    expect(indexAtOffset(100, 0, 3)).toBe(0);
  });

  it('gives each tip time to be read, and waits longer after the user moves it', () => {
    // WCAG 2.2.2: anything moving on its own for over five seconds can be paused,
    // which the carousel's pause control provides.
    expect(TIP_AUTOPLAY_MS).toBeGreaterThanOrEqual(5000);
    expect(TIP_RESUME_MS).toBeGreaterThan(TIP_AUTOPLAY_MS);
  });
});
