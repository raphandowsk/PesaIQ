/** What happened when the user tapped Export. */
export type SaveOutcome =
  | { status: 'saved'; /** The name the file was actually saved under. */ name: string }
  | { status: 'cancelled' };
