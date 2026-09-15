import { useEffect } from 'react';
import { useShareIntent } from 'expo-share-intent';

import { SHARE_AVAILABLE } from './availability';
import { useShareStore } from './store';

/**
 * At the root of the app: take any message shared to PesaIQ, even while the
 * app is signed out or locked, and hold it until it can be opened
 * (`useOpenSharedMessage`). The share is then cleared, so it opens once.
 */
export function useShareCapture(): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent({
    disabled: !SHARE_AVAILABLE,
  });

  useEffect(() => {
    if (!hasShareIntent) return;
    // Text only: PesaIQ is offered for text in the share sheet, nothing else.
    useShareStore.getState().receive(shareIntent.text);
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}
