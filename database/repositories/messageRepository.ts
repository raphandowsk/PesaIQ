/**
 * Source message persistence.
 *
 * These rows hold raw SMS text — the most sensitive thing the app stores.
 * Nothing here logs content, and `removeAll` exists so Settings can honour
 * "Delete all messages" completely.
 */
import type { SqlDatabase } from '../client';

export interface StoredMessage {
  id: string;
  originalText: string;
  normalizedText: string;
  sender: string | null;
  receivedAt: string;
  /**
   * How it arrived: pasted in the Lab, part of the account's bulk import, or
   * (Stage 2) read from the phone.
   */
  source: 'MANUAL' | 'IMPORT' | 'ANDROID_SMS' | 'DEMO';
  isDemo: boolean;
  createdAt: string;
}

interface MessageRow {
  id: string;
  original_text: string;
  normalized_text: string;
  sender: string | null;
  received_at: string;
  source: string;
  is_demo: number;
  created_at: string;
}

const toMessage = (row: MessageRow): StoredMessage => ({
  id: row.id,
  originalText: row.original_text,
  normalizedText: row.normalized_text,
  sender: row.sender,
  receivedAt: row.received_at,
  source: row.source as StoredMessage['source'],
  isDemo: row.is_demo === 1,
  createdAt: row.created_at,
});

export const messageRepository = {
  async insert(db: SqlDatabase, m: StoredMessage): Promise<StoredMessage> {
    await db.runAsync(
      `INSERT INTO messages
         (id, original_text, normalized_text, sender, received_at, source, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        m.id,
        m.originalText,
        m.normalizedText,
        m.sender,
        m.receivedAt,
        m.source,
        m.isDemo ? 1 : 0,
        m.createdAt,
      ],
    );
    return m;
  },

  async findById(db: SqlDatabase, id: string): Promise<StoredMessage | null> {
    const row = await db.getFirstAsync<MessageRow>('SELECT * FROM messages WHERE id = ?', [id]);
    return row ? toMessage(row) : null;
  },

  async list(db: SqlDatabase, limit = 100): Promise<StoredMessage[]> {
    const rows = await db.getAllAsync<MessageRow>(
      'SELECT * FROM messages ORDER BY created_at DESC LIMIT ?',
      [limit],
    );
    return rows.map(toMessage);
  },

  async count(db: SqlDatabase): Promise<number> {
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM messages');
    return row?.n ?? 0;
  },

  async remove(db: SqlDatabase, id: string): Promise<boolean> {
    const r = await db.runAsync('DELETE FROM messages WHERE id = ?', [id]);
    return r.changes > 0;
  },

  async removeAll(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync('DELETE FROM messages');
    return r.changes;
  },

  /** Messages some record came from: they go when every record is deleted. */
  async removeReferencedByTransactions(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync(
      `DELETE FROM messages WHERE id IN
         (SELECT source_message_id FROM transactions WHERE source_message_id IS NOT NULL)`,
    );
    return r.changes;
  },
};
