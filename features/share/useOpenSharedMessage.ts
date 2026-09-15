import { useEffect } from 'react';
import { router } from 'expo-router';

import { openSharedMessage } from './open';
import { useShareStore } from './store';

/**
 * Inside the signed-in, unlocked app: open a shared message in the Lab as
 * soon as there is one, whichever screen is showing.
 */
export function useOpenSharedMessage(): void {
  const pending = useShareStore((s) => s.pending);

  useEffect(() => {
    if (!pending) return;
    const text = useShareStore.getState().take();
    if (text) void openSharedMessage(text, (to) => router.navigate(to));
  }, [pending]);
}
