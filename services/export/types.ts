/** What happened when the user tapped Export. */
export type SaveOutcome =
  | { status: 'saved'; /** The name the file was actually saved under. */ name: string }
  /** iPhone: offered in the share sheet, which does not say what the person chose. */
  | { status: 'shared'; name: string }
  | { status: 'cancelled' };
