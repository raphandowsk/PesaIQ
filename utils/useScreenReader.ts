import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Whether a screen reader is on, so content that moves by itself can hold
 * still. The web cannot tell, so it reports off there; moving content keeps a
 * pause control for that reason.
 */
export function useScreenReader(): boolean {
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => {
        if (alive) setOn(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  return on;
}
