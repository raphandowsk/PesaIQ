import { useEffect, useState } from 'react';
import { Animated, Easing } from 'react-native';

/** The design's easing for bars growing into place. */
export const GROW_EASING = Easing.bezier(0.2, 0.85, 0.2, 1);

interface ProgressOptions {
  /** False under reduced motion: the value sits at 1 and everything renders final. */
  animate: boolean;
  /** Any change replays the animation from 0. */
  replay: string | number;
  duration: number;
  delay?: number;
  easing?: (t: number) => number;
}

/** A 0 → 1 progress value that replays whenever `replay` changes. */
export function useProgress({
  animate,
  replay,
  duration,
  delay = 0,
  easing = GROW_EASING,
}: ProgressOptions): Animated.Value {
  const [progress] = useState(() => new Animated.Value(animate ? 0 : 1));

  useEffect(() => {
    if (!animate) {
      progress.setValue(1);
      return undefined;
    }
    progress.setValue(0);
    const run = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing,
      // Width and SVG stroke offsets cannot run on the native driver.
      useNativeDriver: false,
    });
    run.start();
    return () => run.stop();
  }, [animate, replay, duration, delay, easing, progress]);

  return progress;
}

/** An integer that follows `progress` from 0 to `target`: the score count-up. */
export function useCountUp(target: number, progress: Animated.Value, animate: boolean): number {
  const [shown, setShown] = useState(animate ? 0 : target);

  useEffect(() => {
    const id = progress.addListener(({ value }) => setShown(Math.round(value * target)));
    return () => progress.removeListener(id);
  }, [progress, target]);

  return animate ? shown : target;
}
