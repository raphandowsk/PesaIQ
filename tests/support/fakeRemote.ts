import {
  RemoteError,
  type OutgoingPreferences,
  type OutgoingRecord,
  type PullCursor,
  type RecordsRemote,
  type RemotePreferences,
  type RemoteRecord,
} from '../../features/sync/remote';

/** Microseconds since the epoch, from a server-style or ISO time. */
export function micros(time: string): bigint {
  const fraction = (/\.(\d+)/.exec(time)?.[1] ?? '').padEnd(6, '0').slice(0, 6);
  return BigInt(Date.parse(time.replace(/\.\d+/, ''))) * BigInt(1000) + BigInt(fraction);
}

const isAfter = (row: RemoteRecord, cursor: PullCursor) => {
  const a = micros(row.updatedAt);
  const b = micros(cursor.updatedAt);
  return a > b || (a === b && row.id > cursor.id);
};

const byPullOrder = (x: RemoteRecord, y: RemoteRecord) => {
  const a = micros(x.updatedAt);
  const b = micros(y.updatedAt);
  return a < b ? -1 : a > b ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0;
};

/**
 * One account's `records` table as the server keeps it, in memory:
 * - the latest edit wins (keep_latest_edit);
 * - one live row per fingerprint (records_user_dedupe_key);
 * - a push is one request, so one transaction and one server time for all
 *   its rows, written with microseconds as Postgres does.
 */
export class FakeRemote implements RecordsRemote {
  readonly rows = new Map<string, RemoteRecord>();
  /** Every call fails, as with no connection. */
  offline = false;
  /** The account's `synced_settings` row. */
  preferences: RemotePreferences | null = null;
  private tick = 0;

  private serverTime(): string {
    this.tick += 1;
    const seconds = String(Math.floor(this.tick / 1_000_000)).padStart(2, '0');
    const fraction = String(this.tick % 1_000_000).padStart(6, '0');
    return `2026-09-14T10:00:${seconds}.${fraction}+00:00`;
  }

  private check() {
    if (this.offline) throw new RemoteError('failed', 'Network request failed');
  }

  async pull(after: PullCursor, limit: number): Promise<RemoteRecord[]> {
    this.check();
    return [...this.rows.values()]
      .filter((r) => isAfter(r, after))
      .sort(byPullOrder)
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async push(rows: OutgoingRecord[]): Promise<void> {
    this.check();
    const next = new Map(this.rows);
    const time = this.serverTime();
    for (const row of rows) {
      const old = next.get(row.id);
      if (old && Date.parse(row.editedAt) < Date.parse(old.editedAt)) continue;
      // The server hands times back in its own format.
      next.set(row.id, { ...row, editedAt: row.editedAt.replace('Z', '+00:00'), updatedAt: time });
    }
    const live = new Set<string>();
    for (const r of next.values()) {
      if (r.deleted || !r.dedupeKey) continue;
      if (live.has(r.dedupeKey)) {
        throw new RemoteError('duplicate', 'duplicate key value violates unique constraint');
      }
      live.add(r.dedupeKey);
    }
    this.rows.clear();
    for (const [id, r] of next) this.rows.set(id, r);
  }

  async findLive(dedupeKey: string): Promise<RemoteRecord | null> {
    this.check();
    const found = [...this.rows.values()].find((r) => r.dedupeKey === dedupeKey && !r.deleted);
    return found ? { ...found } : null;
  }

  async fetchPreferences(): Promise<RemotePreferences | null> {
    this.check();
    return this.preferences ? { ...this.preferences } : null;
  }

  async pushPreferences(doc: OutgoingPreferences): Promise<void> {
    this.check();
    // keep_latest_edit, as on the records.
    if (this.preferences && Date.parse(doc.editedAt) < Date.parse(this.preferences.editedAt)) {
      return;
    }
    this.preferences = {
      ciphertext: doc.ciphertext,
      nonce: doc.nonce,
      keyVersion: doc.keyVersion,
      editedAt: doc.editedAt.replace('Z', '+00:00'),
    };
  }
}
