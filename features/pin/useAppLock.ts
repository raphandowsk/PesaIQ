import { useEffect } from 'react';
import { AppState } from 'react-native';

import { usePinStore } from './instance';
import { AWAY_MS } from './lock';

/**
 * Locks the app again when it comes back after `AWAY_MS` or more in the
 * background. A quick trip out (copying a message to paste) does not lock it.
 * Opening the app from closed always locks it: see the PIN store's `check`.
 */
export function useAppLock(now: () => number = Date.now) {
  const ready = usePinStore((s) => s.status === 'ready');
  const lock = usePinStore((s) => s.lock);

  useEffect(() => {
    if (!ready) return;
    let leftAt: number | null = null;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt ??= now();
      } else if (state === 'active') {
        if (leftAt != null && now() - leftAt >= AWAY_MS) lock();
        leftAt = null;
      }
    });
    return () => subscription.remove();
  }, [ready, lock, now]);
}
