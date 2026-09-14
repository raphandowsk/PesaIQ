/**
 * The app store.
 *
 * Screens read from here and call these actions; they never touch SQL or the
 * parser directly. The store owns the database handle, so swapping in a test
 * database is a single `initialize({ database })` call.
 */
import { create } from 'zustand';

import { describeOpenError, getDatabase, type SqlDatabase } from '../../database/client';
import {
  categoryRuleRepository,
  messageRepository,
  processingEventRepository,
  providerRepository,
  settingsRepository,
  transactionRepository,
  parseResultRepository,
  syncRepository,
  DEFAULT_SETTINGS,
  type AppSettings,
} from '../../database/repositories';
import { removeDemoData, seedDatabase } from '../../database/seed';
import {
  applyRememberedCategory,
  parseMessage,
  partyKey,
  type ParseResult,
  type SmsProvider,
} from '../parser';
import { ManualSmsSource } from '../../services/sms';
import { transactionFromParseResult, type Transaction } from './model';
import { transactionKey } from './transactionKey';
import { DEFAULT_CURRENCY, type MoneyCategory } from '../../types/domain';
import type { LabSaveReady } from '../lab/draft';

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

/** A save either stores a record, or finds the transaction is already saved. */
export type SaveOutcome =
  { saved: true; transaction: Transaction } | { saved: false; duplicateOf: Transaction };

/** An edit would make a record repeat another (same transaction ID). */
export class DuplicateRecordError extends Error {
  readonly existing: Transaction;
  constructor(existing: Transaction) {
    super('Another record already has this transaction ID');
    this.name = 'DuplicateRecordError';
    this.existing = existing;
  }
}

/** By name rather than `instanceof`, which a transpiled Error subclass can lose. */
export const isDuplicateRecordError = (e: unknown): e is DuplicateRecordError =>
  e instanceof Error && e.name === 'DuplicateRecordError' && 'existing' in e;

const isUniqueViolation = (e: unknown) =>
  e instanceof Error && /UNIQUE constraint failed/i.test(e.message);

/** The fields that make up a transaction's ID; editing one may change it. */
const KEY_FIELDS: readonly (keyof Transaction)[] = [
  'provider',
  'providerId',
  'transactionReference',
];

interface AppState {
  ready: boolean;
  loading: boolean;
  error: string | null;

  settings: AppSettings;
  transactions: Transaction[];
  /** The provider registry, including which ones the user chose to watch. */
  providers: SmsProvider[];
  /** When the user saved or reviewed something, newest first: the streak's source. */
  activity: string[];
  /** When the user confirmed, corrected or ignored a record: "cleared this week". */
  reviewedAt: string[];
  /** The user's category choice per recipient (`partyKey` -> category). */
  categoryRules: Record<string, MoneyCategory>;

  smsSource: ManualSmsSource;

  initialize(deps?: StoreDeps): Promise<void>;
  refresh(): Promise<void>;

  /** Parse text without saving — used by the Lab preview. */
  analyze(text: string, sender?: string): ParseResult;

  /** Parse, store the message and result, and save a transaction. */
  analyzeAndSave(text: string, sender?: string): Promise<SaveOutcome>;

  /**
   * Save a result a person has looked at in the Lab, possibly corrected.
   * Unlike `analyzeAndSave` — unattended processing, saved as PARSED — this can
   * save as CONFIRMED, because someone checked it. `build` decides the status.
   */
  saveFromLab(result: ParseResult, build: LabSaveReady): Promise<SaveOutcome>;
  /** The user said a Lab result was wrong. Recorded without message content. */
  recordParseRejected(result: ParseResult): Promise<void>;

  /** The real record already saved with this transaction ID, if any. */
  findSaved(key: string | null): Promise<Transaction | null>;
  /** A copy saved before duplicates were skipped is a separate transaction after all. */
  keepBoth(id: string): Promise<void>;

  /** The message a record came from, for its detail screen. Null once deleted. */
  getRecordSource(
    messageId: string | null,
  ): Promise<{ text: string; sender: string | null } | null>;
  /** Whether a record arrived through sync from another phone, so its SMS is not here. */
  isFromOtherPhone(id: string): Promise<boolean>;

  confirm(id: string): Promise<void>;
  markIncorrect(id: string): Promise<void>;
  /**
   * Save the user's corrections. `rememberCategory` is set when the user picked
   * the category themselves, so it is remembered for this recipient.
   */
  correct(
    id: string,
    patch: Partial<Transaction>,
    options?: { rememberCategory?: boolean },
  ): Promise<void>;
  ignore(id: string): Promise<void>;
  remove(id: string): Promise<void>;

  setSetting(key: keyof AppSettings, value: boolean): Promise<void>;

  /** Record whether a provider matters to the user (onboarding and Settings). */
  setProviderEnabled(id: string, enabled: boolean): Promise<void>;
  completeOnboarding(): Promise<void>;
  /** Send the user back through onboarding: Settings -> Replay onboarding. */
  resetOnboarding(): Promise<void>;

  /** Every record, with its source message. Returns how many records went. */
  deleteAllTransactions(): Promise<number>;
  /** Every stored source message; records are kept. Returns how many went. */
  deleteAllMessages(): Promise<number>;
  /** Returns how many events went. */
  clearProcessingHistory(): Promise<number>;
  clearDemoData(): Promise<void>;
  /** Forget every remembered category choice. Returns how many went. */
  forgetCategoryRules(): Promise<number>;

  /**
   * Run sync's database work (features/sync). Nothing is reloaded: the caller
   * refreshes when another phone changed something.
   */
  runSync<T>(task: (db: SqlDatabase) => Promise<T>): Promise<T>;
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

  // Every mutating action ends here, and most also record an event, so the
  // streak's activity is refreshed alongside the records.
  const reload = async () => {
    const database = requireDb();
    const [transactions, activity, reviewedAt] = await Promise.all([
      transactionRepository.list(database),
      processingEventRepository.activityTimestamps(database),
      processingEventRepository.reviewTimestamps(database),
    ]);
    set({ transactions, activity, reviewedAt });
  };

  /** The message, its parse result and the transaction land together or not at all. */
  const persist = async (
    database: SqlDatabase,
    rows: {
      messageId: string;
      parseId: string;
      result: ParseResult;
      transaction: Transaction;
      timestamp: string;
    },
  ) => {
    const { messageId, parseId, result, transaction, timestamp } = rows;
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
  };

  const findExisting = (database: SqlDatabase, key: string | null | undefined) =>
    key ? transactionRepository.findByKey(database, key) : Promise.resolve(null);

  /** The transaction is already saved: nothing is stored, the attempt is noted. */
  const skipped = async (database: SqlDatabase, existing: Transaction): Promise<SaveOutcome> => {
    await processingEventRepository.record(database, {
      id: makeId('evt'),
      kind: 'DUPLICATE_DETECTED',
      messageId: null,
      transactionId: existing.id,
      detail: 'skipped; already saved',
      createdAt: now(),
    });
    await reload();
    return { saved: false, duplicateOf: existing };
  };

  /**
   * Save unless the transaction is already there. Checked first so the user
   * can be told; the database's own rule catches two saves racing each other.
   */
  const saveUnlessSaved = async (
    database: SqlDatabase,
    rows: Parameters<typeof persist>[1],
  ): Promise<Transaction | null> => {
    const key = rows.transaction.transactionKey;
    const before = await findExisting(database, key);
    if (before) return before;
    try {
      await persist(database, rows);
      return null;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      const winner = await findExisting(database, key);
      if (winner) return winner;
      throw e;
    }
  };

  /** Remember the user's category for this recipient, for the next message to them. */
  const learnCategory = async (
    database: SqlDatabase,
    counterparty: string | null,
    category: MoneyCategory | null,
  ) => {
    const key = partyKey(counterparty);
    if (!key || !category) return;
    await categoryRuleRepository.set(database, key, category, now());
    set({ categoryRules: { ...get().categoryRules, [key]: category } });
  };

  return {
    ready: false,
    loading: false,
    error: null,
    settings: DEFAULT_SETTINGS,
    transactions: [],
    providers: [],
    activity: [],
    reviewedAt: [],
    categoryRules: {},
    smsSource: new ManualSmsSource(),

    async initialize(deps = {}) {
      set({ loading: true, error: null });
      try {
        now = deps.now ?? defaultNow;
        makeId = deps.makeId ?? defaultMakeId;
        db = deps.database ?? (await getDatabase());

        await seedDatabase(db, now());

        const [settings, transactions, providers, activity, reviewedAt, categoryRules] =
          await Promise.all([
            settingsRepository.getAll(db),
            transactionRepository.list(db),
            providerRepository.list(db),
            processingEventRepository.activityTimestamps(db),
            processingEventRepository.reviewTimestamps(db),
            categoryRuleRepository.list(db),
          ]);

        await get().smsSource.start();

        set({
          settings,
          transactions,
          providers,
          activity,
          reviewedAt,
          categoryRules,
          ready: true,
          loading: false,
        });
      } catch (e) {
        set({
          loading: false,
          ready: false,
          error: describeOpenError(e),
        });
      }
    },

    async refresh() {
      const database = requireDb();
      await reload();
      // Sync can bring categories and provider choices from another phone.
      const [providers, categoryRules] = await Promise.all([
        providerRepository.list(database),
        categoryRuleRepository.list(database),
      ]);
      set({ providers, categoryRules });
    },

    runSync(task) {
      return task(requireDb());
    },

    analyze(text, sender) {
      // The parse, then the user's remembered category for this recipient.
      return applyRememberedCategory(parseMessage(text, { sender }), get().categoryRules);
    },

    async analyzeAndSave(text, sender) {
      const database = requireDb();
      const timestamp = now();
      const result = get().analyze(text, sender);

      const messageId = makeId('msg');
      const parseId = makeId('parse');
      const transactionId = makeId('txn');

      const transaction = transactionFromParseResult(result, {
        id: transactionId,
        now: timestamp,
        sourceMessageId: messageId,
        parseResultId: parseId,
      });

      // The same transaction is never saved twice.
      const existing = await saveUnlessSaved(database, {
        messageId,
        parseId,
        result,
        transaction,
        timestamp,
      });
      if (existing) return skipped(database, existing);

      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: 'TRANSACTION_SAVED',
        messageId,
        transactionId,
        // Confidence only. Never message content.
        detail: `confidence ${result.confidence.toFixed(2)}`,
        createdAt: timestamp,
      });

      await reload();

      return { saved: true, transaction };
    },

    async saveFromLab(result, build) {
      const database = requireDb();
      const timestamp = now();

      const messageId = makeId('msg');
      const parseId = makeId('parse');
      const transactionId = makeId('txn');

      const transaction: Transaction = {
        ...transactionFromParseResult(result, {
          id: transactionId,
          now: timestamp,
          sourceMessageId: messageId,
          parseResultId: parseId,
        }),
        ...build.values,
        currency: DEFAULT_CURRENCY,
        confidence: build.confidence,
        lowFields: build.remainingLow,
        status: build.status,
        // From the values as corrected: an edited reference is the one that counts.
        transactionKey: transactionKey(build.values, result.normalizedText),
      };

      // The parse result is stored as the parser produced it. The user's
      // corrections live on the transaction and in the correction event.
      const existing = await saveUnlessSaved(database, {
        messageId,
        parseId,
        result,
        transaction,
        timestamp,
      });
      if (existing) return skipped(database, existing);

      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: 'TRANSACTION_SAVED',
        messageId,
        transactionId,
        detail: `lab; confidence ${build.confidence.toFixed(2)}`,
        createdAt: timestamp,
      });

      if (build.editedKeys.length > 0) {
        await processingEventRepository.record(database, {
          id: makeId('evt'),
          kind: 'TRANSACTION_CORRECTED',
          messageId,
          transactionId,
          // Which fields changed, never what they were changed to.
          detail: build.editedKeys.join(','),
          createdAt: timestamp,
        });
      }

      if (build.editedKeys.includes('moneyCategory')) {
        await learnCategory(database, transaction.counterparty, transaction.moneyCategory);
      }

      await reload();

      return { saved: true, transaction };
    },

    async findSaved(key) {
      return findExisting(requireDb(), key);
    },

    async keepBoth(id) {
      const database = requireDb();
      await transactionRepository.update(database, id, { duplicateOf: null }, now());
      await reload();
    },

    async recordParseRejected(result) {
      await processingEventRepository.record(requireDb(), {
        id: makeId('evt'),
        kind: 'PARSE_REJECTED',
        messageId: null,
        transactionId: null,
        detail: `${result.parserId}; ${result.category}; confidence ${result.confidence.toFixed(2)}`,
        createdAt: now(),
      });
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

    async getRecordSource(messageId) {
      if (!messageId) return null;
      const message = await messageRepository.findById(requireDb(), messageId);
      return message ? { text: message.originalText, sender: message.sender } : null;
    },

    isFromOtherPhone(id) {
      return syncRepository.receivedFromSync(requireDb(), id);
    },

    async markIncorrect(id) {
      const database = requireDb();
      await transactionRepository.update(database, id, { status: 'NEEDS_REVIEW' }, now());
      await reload();
    },

    async correct(id, patch, options = {}) {
      const database = requireDb();
      const timestamp = now();
      const before = await transactionRepository.findById(database, id);

      // Editing the provider or reference can change the transaction's ID. It
      // must not become another record's: that record is the same transaction.
      let keyPatch: Partial<Transaction> = {};
      if (before && KEY_FIELDS.some((k) => k in patch)) {
        const message = before.sourceMessageId
          ? await messageRepository.findById(database, before.sourceMessageId)
          : null;
        const key = transactionKey({ ...before, ...patch }, message?.normalizedText);
        if (key !== (before.transactionKey ?? null) && !before.duplicateOf) {
          const clash =
            key && !before.isDemo ? await transactionRepository.findByKey(database, key, id) : null;
          if (clash) throw new DuplicateRecordError(clash);
          keyPatch = { transactionKey: key };
        }
      }

      // A human has now checked it, so it is verified and nothing stays flagged.
      await transactionRepository.update(
        database,
        id,
        { ...patch, ...keyPatch, status: 'CONFIRMED', confidence: 1, lowFields: [] },
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

      if (options.rememberCategory && patch.moneyCategory) {
        const party =
          patch.counterparty !== undefined ? patch.counterparty : (before?.counterparty ?? null);
        await learnCategory(database, party, patch.moneyCategory);
      }

      await reload();
    },

    async ignore(id) {
      const database = requireDb();
      const timestamp = now();
      await transactionRepository.update(database, id, { status: 'IGNORED' }, timestamp);
      await processingEventRepository.record(database, {
        id: makeId('evt'),
        kind: 'TRANSACTION_IGNORED',
        messageId: null,
        transactionId: id,
        detail: null,
        createdAt: timestamp,
      });
      await reload();
    },

    async remove(id) {
      const database = requireDb();
      const timestamp = now();
      const existing = await transactionRepository.findById(database, id);

      // The source message goes with its record: leaving the SMS text behind
      // would keep the most sensitive part of what the user deleted. Its parse
      // result cascades with it.
      await database.withTransactionAsync(async () => {
        const copies = await transactionRepository.listCopiesOf(database, id);
        await transactionRepository.remove(database, id);

        // Copies of a deleted record: the oldest takes over its transaction ID,
        // the others now repeat that one.
        const [heir, ...rest] = copies;
        if (heir) {
          await transactionRepository.update(
            database,
            heir.id,
            { transactionKey: existing?.transactionKey ?? null, duplicateOf: null },
            timestamp,
          );
          for (const copy of rest) {
            await transactionRepository.update(
              database,
              copy.id,
              { duplicateOf: heir.id },
              timestamp,
            );
          }
        }

        const messageId = existing?.sourceMessageId;
        if (
          messageId &&
          (await transactionRepository.countBySourceMessage(database, messageId)) === 0
        ) {
          await messageRepository.remove(database, messageId);
        }
      });
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
      const database = requireDb();
      let removed = 0;

      // Records and their source text go together or not at all: the single
      // delete's rule, in bulk. Remembered categories hold recipient names, so
      // they go too. Demo data is switched off, or seeding would bring the
      // samples back on the next launch.
      await database.withTransactionAsync(async () => {
        await messageRepository.removeReferencedByTransactions(database);
        removed = await transactionRepository.removeAll(database);
        await categoryRuleRepository.removeAll(database);
        await settingsRepository.set(database, 'demoDataEnabled', false, now());
      });

      set({ settings: await settingsRepository.getAll(database), categoryRules: {} });
      await reload();
      return removed;
    },

    async deleteAllMessages() {
      const removed = await messageRepository.removeAll(requireDb());
      // Parse results cascade and records lose their link; reload so nothing in
      // memory still points at a message that is gone.
      await reload();
      return removed;
    },

    async clearProcessingHistory() {
      const removed = await processingEventRepository.removeAll(requireDb());
      // The streak and "cleared this week" are built from that history, so
      // they go with it.
      set({ activity: [], reviewedAt: [] });
      return removed;
    },

    async clearDemoData() {
      const database = requireDb();
      await removeDemoData(database, now());
      set({ settings: await settingsRepository.getAll(database) });
      await reload();
    },

    async forgetCategoryRules() {
      const removed = await categoryRuleRepository.removeAll(requireDb());
      set({ categoryRules: {} });
      return removed;
    },
  };
});
