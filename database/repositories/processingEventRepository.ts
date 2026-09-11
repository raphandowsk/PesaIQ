/**
 * The audit trail of what the app did.
 *
 * Deliberately carries NO message content — only ids, a kind, and a short
 * detail string. This is what makes "clear processing history" meaningful and
 * keeps the promise in docs/PRIVACY.md that full messages are never logged.
 */
import type { SqlDatabase } from '../client';

export type ProcessingEventKind =
  | 'MESSAGE_PARSED'
  | 'TRANSACTION_SAVED'
  | 'TRANSACTION_CONFIRMED'
  | 'TRANSACTION_CORRECTED'
  | 'TRANSACTION_IGNORED'
  | 'TRANSACTION_DELETED'
  | 'DUPLICATE_DETECTED'
  | 'DEMO_DATA_REMOVED'
  /** The user said a Lab result was wrong. Carries parser id and category only. */
  | 'PARSE_REJECTED';

export interface ProcessingEvent {
  id: string;
  kind: ProcessingEventKind;
  messageId: string | null;
  transactionId: string | null;
  /** Short, non-sensitive. Never message text. */
  detail: string | null;
  createdAt: string;
}

interface EventRow {
  id: string;
  kind: string;
  message_id: string | null;
  transaction_id: string | null;
  detail: string | null;
  created_at: string;
}

const toEvent = (row: EventRow): ProcessingEvent => ({
  id: row.id,
  kind: row.kind as ProcessingEventKind,
  messageId: row.message_id,
  transactionId: row.transaction_id,
  detail: row.detail,
  createdAt: row.created_at,
});

export const processingEventRepository = {
  async record(db: SqlDatabase, event: ProcessingEvent): Promise<void> {
    await db.runAsync(
      `INSERT INTO processing_events (id, kind, message_id, transaction_id, detail, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [event.id, event.kind, event.messageId, event.transactionId, event.detail, event.createdAt],
    );
  },

  async list(db: SqlDatabase, limit = 100): Promise<ProcessingEvent[]> {
    const rows = await db.getAllAsync<EventRow>(
      'SELECT * FROM processing_events ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
    return rows.map(toEvent);
  },

  async removeAll(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync('DELETE FROM processing_events');
    return r.changes;
  },
};
