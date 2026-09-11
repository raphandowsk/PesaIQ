/**
 * The app store.
 *
 * Screens read from here and call these actions; they never touch SQL or the
 * parser directly. The store owns the database handle, so swapping in a test
 * database is a single `initialize({ database })` call.
 */
import { create } from 'zustand';

import { getDatabase, type SqlDatabase } from '../../database/client';
import {
  messageRepository,
  processingEventRepository,
  providerRepository,
  settingsRepository,
  transactionRepository,
  parseResultRepository,
  DEFAULT_SETTINGS,
  type AppSettings,
} from '../../database/repositories';
import { removeDemoData, seedDatabase } from '../../database/seed';
import { parseMessage, type ParseResult, type SmsProvider } from '../parser';
import { ManualSmsSource } from '../../services/sms';
import { transactionFromParseResult, type Transaction } from './model';

/** Overridable for tests; production uses the real clock and crypto. */
export interface StoreDeps {
  database?: SqlDatabase;
  now?: () => string;
  makeId?: (prefix: string) => string;
}

const defaultNow = () => new Date().toISOString();

let counter = 0;
const defaultMakeId = (prefix: string) => {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
};

export interface SaveOutcome {
  transaction: Transaction;
  /** Set when an existing record already carried this reference. */
  duplicateOf?: Transaction;
}

interface AppState {
  ready: boolean;
  loading: boolean;
  error: string | null;

  settings: AppSettings;
  transactions: Transaction[];
  /** The provider registry, including which ones the user chose to watch. */
  providers: SmsProvider[];

  smsSource: ManualSmsSource;

  initialize(deps?: StoreDeps): Promise<void>;
  refresh(): Promise<void>;

  /** Parse text without saving — used by the Lab preview. */
  analyze(text: string, sender?: string): ParseResult;

  /** Parse, store the message and result, and save a transaction. */
  analyzeAndSave(text: string, sender?: string): Promise<SaveOutcome>;

  confirm(id: string): Promise<void>;
  markIncorrect(id: string): Promise<void>;
  correct(id: string, patch: Partial<Transaction>): Promise<void>;
  ignore(id: string): Promise<void>;
  remove(id: string): Promise<void>;

  setSetting(key: keyof AppSettings, value: boolean): Promise<void>;

  /** Record whether a provider matters to the user (onboarding and Settings). */
  setProviderEnabled(id: string, enabled: boolean): Promise<void>;
  completeOnboarding(): Promise<void>;
  /** Send the user back through onboarding: Settings -> Replay onboarding. */
  resetOnboarding(): Promise<void>;

  deleteAllTransactions(): Promise<void>;
  deleteAllMessages(): Promise<void>;
  clearProcessingHistory(): Promise<void>;
  clearDemoData(): Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => {
  // Held outside the reactive state: changing them must not re-render.
  let db: SqlDatabase | null = null;
  let now = defaultNow;
  let makeId = defaultMakeId;

  const requireDb = (): SqlDatabase => {
    if (!db) throw new Error('Store used before initialize()');
    return db;
  };

  const reload = async () => {
    const transactions = await transactionRepository.list(requireDb());
    set({ transactions });
  };

  return {
    ready: false,
    loading: false,
    error: null,
    settings: DEFAULT_SETTINGS,
    transactions: [],
    providers: [],
    smsSource: new ManualSmsSource(),

    async initialize(deps = {}) {
      set({ loading: true, error: null });
      try {
        now = deps.now ?? defaultNow;
        makeId = deps.makeId ?? defaultMakeId;
        db = deps.database ?? (await getDatabase());

        await seedDatabase(db, now());

        const [settings, transactions, providers] = await Promise.all([
          settingsRepository.getAll(db),
          transactionRepository.list(db),
          providerRepository.list(db),
        ]);

        await get().smsSource.start();

        set({ settings, transactions, providers, ready: true, loading: false });
      } catch (e) {
        set({
          loading: false,
          ready: false,
          error: e instanceof Error ? e.message : 'Could not open the database.',
        });
      }
    },

    async refresh() {
      await reload();
    },

    analyze(text, sender) {
      return parseMessage(text, { sender });
    },

    async analyzeAndSave(text, sender) {
      const database = requireDb();
      const timestamp = now();
      const result = parseMessage(text, { sender });

      const messageId = makeId('msg');
      const parseId = makeId('parse');
      const transactionId = makeId('txn');

      // Checked before inserting so the user can be told, but the record is
      // still saved: a repeated reference is a strong hint, not a certainty,
      // and silently dropping a real transaction would be worse.
      const duplicate = result.transactionReference
        ? await transactionRepository.findByReference(database, result.transactionReference)
        : null;

      const transaction = transactionFromParseResult(result, {
        id: transactionId,
        now: timestamp,
        sourceMessageId: messageId,
        parseResultId: parseId,
      });

      await database.withTransactionAsync(async () => {
        await messageRepository.insert(database, {
          id: messageId,
          originalText: result.originalText,
          normalizedText: result.normalizedText,
          sender: result.sender ?? null,
          receivedAt: timestamp,
          source: 'MANUAL',
          isDemo: false,
          createdAt: timestamp,
        });

        await parseResultRepository.insert(database, {
          id: parseId,
          messageId,
          result,
          createdAt: timestamp,
        });

        await transactionRepository.insert(database, transaction);
      });

      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: duplicate ? 'DUPLICATE_DETECTED' : 'TRANSACTION_SAVED',
        messageId,
        transactionId,
        // Confidence only. Never message content.
        detail: `confidence ${result.confidence.toFixed(2)}`,
        createdAt: timestamp,
      });

      await reload();

      return duplicate ? { transaction, duplicateOf: duplicate } : { transaction };
    },

    async confirm(id) {
      const database = requireDb();
      const timestamp = now();
      await transactionRepository.update(
        database,
        id,
        { status: 'CONFIRMED', lowFields: [] },
        timestamp,
      );
      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: 'TRANSACTION_CONFIRMED',
        messageId: null,
        transactionId: id,
        detail: null,
        createdAt: timestamp,
      });
      await reload();
    },

    async markIncorrect(id) {
      const database = requireDb();
      await transactionRepository.update(database, id, { status: 'NEEDS_REVIEW' }, now());
      await reload();
    },

    async correct(id, patch) {
      const database = requireDb();
      const timestamp = now();

      // A human has now checked it, so it is verified and nothing stays flagged.
      await transactionRepository.update(
        database,
        id,
        { ...patch, status: 'CONFIRMED', confidence: 1, lowFields: [] },
        timestamp,
      );

      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: 'TRANSACTION_CORRECTED',
        messageId: null,
        transactionId: id,
        detail: Object.keys(patch).join(','),
        createdAt: timestamp,
      });

      await reload();
    },

    async ignore(id) {
      const database = requireDb();
      await transactionRepository.update(database, id, { status: 'IGNORED' }, now());
      await reload();
    },

    async remove(id) {
      const database = requireDb();
      const timestamp = now();
      await transactionRepository.remove(database, id);
      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: 'TRANSACTION_DELETED',
        messageId: null,
        transactionId: id,
        detail: null,
        createdAt: timestamp,
      });
      await reload();
    },

    async setSetting(key, value) {
      const database = requireDb();
      await settingsRepository.set(database, key, value, now());
      set({ settings: await settingsRepository.getAll(database) });
    },

    async setProviderEnabled(id, enabled) {
      const database = requireDb();
      await providerRepository.setEnabled(database, id, enabled);
      set({ providers: await providerRepository.list(database) });
    },

    async completeOnboarding() {
      await get().setSetting('onboardingComplete', true);
    },

    async resetOnboarding() {
      await get().setSetting('onboardingComplete', false);
    },

    async deleteAllTransactions() {
      await transactionRepository.removeAll(requireDb());
      await reload();
    },

    async deleteAllMessages() {
      await messageRepository.removeAll(requireDb());
    },

    async clearProcessingHistory() {
      await processingEventRepository.removeAll(requireDb());
    },

    async clearDemoData() {
      const database = requireDb();
      await removeDemoData(database, now());
      set({ settings: await settingsRepository.getAll(database) });
      await reload();
    },
  };
});
