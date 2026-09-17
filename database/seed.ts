/**
 * First-run seeding: the provider registry and the demo records.
 *
 * Idempotent — safe on every launch. Demo records are only inserted while the
 * `demoDataEnabled` setting is on, so once the user removes them they stay
 * removed rather than reappearing on the next start.
 */
import { DEMO_RECORDS, demoMessageId } from '../features/transactions/demoData';
import type { SqlDatabase } from './client';
import {
  messageRepository,
  processingEventRepository,
  providerRepository,
  settingsRepository,
  transactionRepository,
} from './repositories';

export interface SeedResult {
  providersSeeded: boolean;
  demoRecordsInserted: number;
}

export async function seedDatabase(db: SqlDatabase, now: string): Promise<SeedResult> {
  await providerRepository.seed(db);

  const demoEnabled = await settingsRepository.get(db, 'demoDataEnabled');
  if (!demoEnabled) return { providersSeeded: true, demoRecordsInserted: 0 };

  // Presence of the first record is enough: they are inserted together.
  const existing = await transactionRepository.findById(db, DEMO_RECORDS[0].transaction.id);
  if (existing) return { providersSeeded: true, demoRecordsInserted: 0 };

  let inserted = 0;

  await db.withTransactionAsync(async () => {
    for (const [index, record] of DEMO_RECORDS.entries()) {
      await messageRepository.insert(db, {
        id: demoMessageId(index),
        originalText: record.messageText,
        normalizedText: record.messageText.trim(),
        sender: record.sender,
        receivedAt: record.transaction.createdAt,
        source: 'DEMO',
        isDemo: true,
        createdAt: record.transaction.createdAt,
      });

      await transactionRepository.insert(db, record.transaction);
      inserted += 1;
    }
  });

  return { providersSeeded: true, demoRecordsInserted: inserted };
}

/**
 * Remove generated samples and remember the choice.
 *
 * Deletes demo messages as well as demo transactions — leaving the source text
 * behind would keep the most sensitive part of what the user asked to remove —
 * and the history of what was done to them.
 */
export async function removeDemoData(db: SqlDatabase, now: string): Promise<number> {
  let removed = 0;

  await db.withTransactionAsync(async () => {
    // What was done to the samples goes with them, so the streak and "cleared
    // this week" count only the user's own records.
    await db.runAsync(
      'DELETE FROM processing_events WHERE transaction_id IN (SELECT id FROM transactions WHERE is_demo = 1)',
    );
    removed = await transactionRepository.removeDemo(db);
    await db.runAsync('DELETE FROM messages WHERE is_demo = 1');
    await settingsRepository.set(db, 'demoDataEnabled', false, now);
  });

  await processingEventRepository.record(db, {
    id: `evt-demo-${now}`,
    kind: 'DEMO_DATA_REMOVED',
    messageId: null,
    transactionId: null,
    detail: `${removed} records`,
    createdAt: now,
  });

  return removed;
}
