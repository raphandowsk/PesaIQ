/** Paging and timing for Home's tip carousels. */

/** How long each tip stays before the next one slides in. */
export const TIP_AUTOPLAY_MS = 6000;

/** After a swipe or a dot tap, autoplay waits this long before moving again. */
export const TIP_RESUME_MS = 12000;

/** The page after `i`, back to the first after the last. */
export const nextIndex = (i: number, count: number): number => (count > 0 ? (i + 1) % count : 0);

/** The page nearest a scroll offset, kept within the list. */
export function indexAtOffset(x: number, width: number, count: number): number {
  if (width <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(x / width)));
}
