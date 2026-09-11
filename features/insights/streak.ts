/**
 * The activity streak shown on the health card.
 *
 * The design hard-codes "6-day streak". Here it is real: the number of
 * consecutive days on which the user saved or reviewed a record, read from the
 * processing-event timestamps. Clearing processing history clears it too,
 * because that history is what it is made of.
 */

/** Local calendar day, YYYY-MM-DD. A streak follows the user's day, not UTC's. */
export function localDayKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Consecutive active days ending today.
 *
 * A streak last extended yesterday is still alive: it breaks only once a
 * whole day passes with nothing done, so opening the app in the morning never
 * greets the user with a reset streak.
 */
export function activityStreak(timestamps: readonly string[], now: Date): number {
  const days = new Set<string>();
  for (const ts of timestamps) {
    const d = new Date(ts);
    if (!Number.isNaN(d.getTime())) days.add(localDayKey(d));
  }

  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);

  let streak = 0;
  while (days.has(localDayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
