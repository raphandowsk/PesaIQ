import { useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { useAuthStore } from '../auth';
import { usePinStore } from '../pin';
import { useAppStore } from '../transactions/store';
import { useSyncStore } from './instance';

/** Changes are sent this long after the last one, so a burst goes in one sync. */
const SETTLE_MS = 4000;

/**
 * Keeps this phone in sync while sync is on, the account is signed in and its
 * key is unlocked: when that starts, when the app comes back to the front,
 * and a moment after records change.
 */
export function useAutoSync() {
  const enabled = useAppStore((s) => s.settings.cloudSync);
  const transactions = useAppStore((s) => s.transactions);
  const userId = useAuthStore((s) => s.session?.userId ?? null);
  const pinUser = usePinStore((s) => s.userId);
  const accountKey = usePinStore((s) => s.accountKey);
  const syncNow = useSyncStore((s) => s.syncNow);
  const reset = useSyncStore((s) => s.reset);

  const context = useMemo(
    () => (enabled && userId && accountKey && pinUser === userId ? { userId, accountKey } : null),
    [enabled, userId, accountKey, pinUser],
  );

  useEffect(() => {
    if (!context) {
      reset();
      return;
    }
    void syncNow(context);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow(context);
    });
    return () => subscription.remove();
  }, [context, syncNow, reset]);

  useEffect(() => {
    if (!context) return;
    const timer = setTimeout(() => void syncNow(context), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [transactions, context, syncNow]);
}
