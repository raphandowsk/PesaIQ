import { useEffect } from 'react';
import { AppState } from 'react-native';

import { usePinStore } from './instance';

/** Without an answer from the server, asked again this often. */
const RETRY_MS = 60_000;

/**
 * Confirms that the key on this phone is still the account's: once it is
 * ready, whenever the app comes back to the front, and every minute until the
 * server answers. Sync waits for the answer, so a phone that missed a "Forgot
 * PIN" never sends records locked with the old key.
 */
export function useKeyCheck() {
  const status = usePinStore((s) => s.status);
  const verified = usePinStore((s) => s.verified);
  const verify = usePinStore((s) => s.verify);

  useEffect(() => {
    if (status !== 'ready') return;
    if (!verified) void verify();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void verify();
    });
    const retry = verified ? null : setInterval(() => void verify(), RETRY_MS);
    return () => {
      subscription.remove();
      if (retry) clearInterval(retry);
    };
  }, [status, verified, verify]);
}
