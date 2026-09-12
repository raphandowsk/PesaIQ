import type { SaveOutcome } from '../export/types';

/** What happened when the user tapped Save PDF. On web, only that the print window opened. */
export type ReportOutcome = SaveOutcome | { status: 'printing' };
