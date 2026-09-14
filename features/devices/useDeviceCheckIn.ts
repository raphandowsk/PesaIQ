import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useAuthStore } from '../auth';
import { usePinStore } from '../pin';
import { useDevicesStore } from './instance';

/** While signed in and unlocked, this phone keeps its place in the list up to date. */
export function useDeviceCheckIn() {
  const userId = useAuthStore((s) => s.session?.userId ?? null);
  const unlocked = usePinStore((s) => s.status === 'ready');
  const checkIn = useDevicesStore((s) => s.checkIn);

  useEffect(() => {
    if (!userId || !unlocked) return;
    void checkIn(userId);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkIn(userId);
    });
    return () => subscription.remove();
  }, [userId, unlocked, checkIn]);
}
