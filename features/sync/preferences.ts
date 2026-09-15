/**
 * Remembered categories, provider choices and the optional name, synced as one
 * locked document per account (`synced_settings`).
 *
 * Every entry carries the time it was made, and entries merge one by one: the
 * later one wins, a forgotten category included. Two phones that each learn a
 * different recipient while apart both end up with both.
 *
 * The other settings stay on each phone: Cloud sync (each phone's own choice),
 * demo data, onboarding, and the Stage 2 switches.
 */
import { z } from 'zod';

import { MONEY_CATEGORIES, type MoneyCategory } from '../../types/domain';
import { fromAsciiBytes, toAsciiBytes } from './payload';

/** The row id the document is locked to (see crypto.ts). */
export const PREFERENCES_ROW = 'preferences';

export interface CategoryEntry {
  /** Null: the user forgot this recipient's category. */
  category: MoneyCategory | null;
  at: string;
}

export interface ProviderEntry {
  enabled: boolean;
  at: string;
}

export interface NameEntry {
  /** Null: the user removed their name. */
  name: string | null;
  at: string;
}

export interface Preferences {
  /** By recipient (`partyKey`). */
  categories: Record<string, CategoryEntry>;
  /** By provider id. */
  providers: Record<string, ProviderEntry>;
  /** The name Home greets by (features/profile). Absent until set or removed on some phone. */
  name?: NameEntry;
}

export const NO_PREFERENCES: Preferences = { categories: {}, providers: {} };

const preferencesSchema = z.object({
  v: z.literal(1),
  categories: z.record(
    z.string(),
    z.object({ category: z.enum(MONEY_CATEGORIES).nullable(), at: z.string() }),
  ),
  providers: z.record(z.string(), z.object({ enabled: z.boolean(), at: z.string() })),
  // Optional: documents written before names existed have none.
  name: z.object({ name: z.string().nullable(), at: z.string() }).optional(),
});

export const encodePreferences = (p: Preferences): Uint8Array =>
  toAsciiBytes({
    v: 1,
    categories: p.categories,
    providers: p.providers,
    ...(p.name ? { name: p.name } : {}),
  });

/** The document, or null for anything this app did not write. */
export function decodePreferences(bytes: Uint8Array): Preferences | null {
  const text = fromAsciiBytes(bytes);
  if (text === null) return null;
  try {
    const parsed = preferencesSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return null;
    const { categories, providers, name } = parsed.data;
    return name ? { categories, providers, name } : { categories, providers };
  } catch {
    return null;
  }
}

/** The later entry wins; an exact tie is settled the same way on every phone. */
const beats = <T extends { at: string }>(a: T, b: T | undefined): boolean =>
  !b || a.at > b.at || (a.at === b.at && JSON.stringify(a) > JSON.stringify(b));

export interface PreferencesMerge {
  /** Both sides, the later entry for each key. */
  merged: Preferences;
  /** Entries from the server newer than this phone's. */
  toApply: {
    categories: [string, CategoryEntry][];
    providers: [string, ProviderEntry][];
    /** The server's name, when newer than this phone's. */
    name: NameEntry | null;
  };
  /** This phone has entries the server lacks or has older: send the merge. */
  newerHere: boolean;
}

export function mergePreferences(here: Preferences, server: Preferences): PreferencesMerge {
  const merged: Preferences = {
    categories: { ...server.categories },
    providers: { ...server.providers },
    ...(server.name ? { name: server.name } : {}),
  };
  const toApply: PreferencesMerge['toApply'] = { categories: [], providers: [], name: null };
  let newerHere = false;

  for (const [key, entry] of Object.entries(here.categories)) {
    if (beats(entry, server.categories[key])) {
      merged.categories[key] = entry;
      newerHere = true;
    }
  }
  for (const [key, entry] of Object.entries(server.categories)) {
    if (beats(entry, here.categories[key])) toApply.categories.push([key, entry]);
  }

  for (const [id, entry] of Object.entries(here.providers)) {
    if (beats(entry, server.providers[id])) {
      merged.providers[id] = entry;
      newerHere = true;
    }
  }
  for (const [id, entry] of Object.entries(server.providers)) {
    if (beats(entry, here.providers[id])) toApply.providers.push([id, entry]);
  }

  if (here.name && beats(here.name, server.name)) {
    merged.name = here.name;
    newerHere = true;
  }
  if (server.name && beats(server.name, here.name)) toApply.name = server.name;

  return { merged, toApply, newerHere };
}
