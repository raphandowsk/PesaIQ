import type { Transaction } from '../../features/transactions/model';
import { useAppStore } from '../../features/transactions/store';

/** Analyze and save a message that must be new; fails the test if it was skipped. */
export async function saveNew(text: string, sender?: string): Promise<Transaction> {
  const outcome = await useAppStore.getState().analyzeAndSave(text, sender);
  if (!outcome.saved) throw new Error('Expected a new record, but it was already saved');
  return outcome.transaction;
}
