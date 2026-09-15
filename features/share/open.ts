import { useLabStore } from '../lab/store';

export type SharedDestination = '/result' | '/parser-lab';

/**
 * Read a shared message exactly as if it had been pasted in the Lab, then
 * show the result. A message that can't be read (too long, say) opens the Lab
 * instead, with the reason and the text there to trim.
 *
 * Whatever was in the Lab gives way: sharing is an explicit choice, and a
 * sample's sender left over from before must not bias the reading.
 */
export async function openSharedMessage(
  text: string,
  go: (to: SharedDestination) => void,
): Promise<void> {
  const lab = useLabStore.getState();
  lab.discard();
  lab.setText(text);
  const ok = await useLabStore.getState().analyze();
  go(ok ? '/result' : '/parser-lab');
}
