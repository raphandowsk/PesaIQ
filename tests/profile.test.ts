import type { SqlDatabase } from '../database/client';
import { profileRepository } from '../database/repositories';
import { cleanName, NAME_MAX_LENGTH, welcomeLine } from '../features/profile/name';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

// Invented names only.
const NOW = '2026-09-15T09:00:00.000Z';

describe('cleanName', () => {
  it('trims, and makes runs of spaces one', () => {
    expect(cleanName('  Asha   Mwita ')).toBe('Asha Mwita');
  });

  it('is null for nothing, or only spaces', () => {
    expect(cleanName('')).toBeNull();
    expect(cleanName('   ')).toBeNull();
    expect(cleanName(null)).toBeNull();
    expect(cleanName(undefined)).toBeNull();
  });

  it('drops control characters', () => {
    expect(cleanName('Asha\nMwita\t')).toBe('Asha Mwita');
  });

  it('keeps letters beyond English', () => {
    expect(cleanName('Zuhura Ñandú')).toBe('Zuhura Ñandú');
  });

  it('cuts a long name to the limit without splitting an emoji', () => {
    const cleaned = cleanName(`${'A'.repeat(NAME_MAX_LENGTH - 1)}🙂🙂`)!;
    expect(Array.from(cleaned)).toHaveLength(NAME_MAX_LENGTH);
    expect(cleaned.endsWith('🙂')).toBe(true);
  });
});

describe("Home's welcome line", () => {
  it('greets by name when there is one', () => {
    expect(welcomeLine('Asha')).toBe('Welcome, Asha');
  });

  it('says "Welcome back" without one', () => {
    expect(welcomeLine(null)).toBe('Welcome back');
  });
});

describe('the name in the store', () => {
  let db: SqlDatabase;
  const init = () => useAppStore.getState().initialize({ database: db, now: () => NOW });

  beforeEach(async () => {
    db = await createMigratedDatabase();
    await init();
  });
  afterEach(() => db.closeAsync());

  it('starts with no name, and skipping writes nothing', async () => {
    expect(useAppStore.getState().displayName).toBeNull();
    await useAppStore.getState().setDisplayName('   ');
    expect(await profileRepository.getName(db)).toBeNull();
  });

  it('remembers a name across a restart, cleaned', async () => {
    await useAppStore.getState().setDisplayName('  Asha ');
    expect(useAppStore.getState().displayName).toBe('Asha');

    await init();
    expect(useAppStore.getState().displayName).toBe('Asha');
  });

  it('removes a name, keeping when it was removed so sync can carry it', async () => {
    await useAppStore.getState().setDisplayName('Asha');
    await useAppStore.getState().setDisplayName('');
    expect(useAppStore.getState().displayName).toBeNull();
    expect(await profileRepository.getName(db)).toEqual({ name: null, at: NOW });
  });

  it('leaves the on/off settings alone', async () => {
    const before = useAppStore.getState().settings;
    await useAppStore.getState().setDisplayName('Asha');
    await init();
    expect(useAppStore.getState().settings).toEqual(before);
  });
});
