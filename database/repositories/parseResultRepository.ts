/**
 * Parse-result persistence.
 *
 * The full result is stored as JSON in `payload` rather than exploded into
 * columns: it is written once and read whole by the "How we got this" view, and
 * the indexed columns beside it (category, confidence, band) cover the only
 * queries we actually run. Exploding it would mean a migration every time the
 * parser gains a field.
 */
import { validateParseResult, type ParseResult } from '../../features/parser';
import type { SqlDatabase } from '../client';

export interface StoredParseResult {
  id: string;
  messageId: string;
  parserId: string;
  category: string;
  type: string;
  confidence: number;
  band: string;
  result: ParseResult;
  createdAt: string;
}

interface ParseResultRow {
  id: string;
  message_id: string;
  parser_id: string;
  category: string;
  type: string;
  confidence: number;
  band: string;
  payload: string;
  created_at: string;
}

/** Returns null rather than throwing when a stored payload is unreadable. */
function toStored(row: ParseResultRow): StoredParseResult | null {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payload);
  } catch {
    return null;
  }

  const validated = validateParseResult(payload);
  if (!validated.ok || !validated.result) return null;

  return {
    id: row.id,
    messageId: row.message_id,
    parserId: row.parser_id,
    category: row.category,
    type: row.type,
    confidence: row.confidence,
    band: row.band,
    result: validated.result,
    createdAt: row.created_at,
  };
}

export const parseResultRepository = {
  async insert(
    db: SqlDatabase,
    input: { id: string; messageId: string; result: ParseResult; createdAt: string },
  ): Promise<StoredParseResult> {
    const { id, messageId, result, createdAt } = input;

    await db.runAsync(
      `INSERT INTO parse_results
         (id, message_id, parser_id, category, type, confidence, band, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        messageId,
        result.parserId,
        result.category,
        result.type,
        result.confidence,
        result.band,
        JSON.stringify(result),
        createdAt,
      ],
    );

    return {
      id,
      messageId,
      parserId: result.parserId,
      category: result.category,
      type: result.type,
      confidence: result.confidence,
      band: result.band,
      result,
      createdAt,
    };
  },

  async findById(db: SqlDatabase, id: string): Promise<StoredParseResult | null> {
    const row = await db.getFirstAsync<ParseResultRow>('SELECT * FROM parse_results WHERE id = ?', [
      id,
    ]);
    return row ? toStored(row) : null;
  },

  async findByMessageId(db: SqlDatabase, messageId: string): Promise<StoredParseResult[]> {
    const rows = await db.getAllAsync<ParseResultRow>(
      'SELECT * FROM parse_results WHERE message_id = ? ORDER BY created_at DESC',
      [messageId],
    );
    return rows.map(toStored).filter((r): r is StoredParseResult => r !== null);
  },

  async removeAll(db: SqlDatabase): Promise<number> {
    const r = await db.runAsync('DELETE FROM parse_results');
    return r.changes;
  },
};
