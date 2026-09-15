import type { SqlDatabase } from '../database/client';
import { DEFAULT_SETTINGS } from '../database/repositories';
import { HOW_STEPS, PRIVACY_POINTS, SETUP_COPY, WELCOME } from '../features/onboarding/content';
import { useAppStore } from '../features/transactions/store';
import { createMigratedDatabase } from './support/nodeSqlite';

const NOW = '2026-09-11T12:00:00.000Z';

describe('onboarding copy', () => {
  const everything = [
    WELCOME.title,
    ...HOW_STEPS.flatMap((s) => [s.title, s.body]),
    ...PRIVACY_POINTS,
    ...Object.values(SETUP_COPY),
  ]
    .join(' ')
    .toLowerCase();

  it('has the four steps, in order', () => {
    expect(HOW_STEPS.map((s) => s.title)).toEqual(['Message', 'Understand', 'Extract', 'Organize']);
  });

  it('says the app only handles messages the user pastes or shares', () => {
    expect(PRIVACY_POINTS.join(' ')).toMatch(/only messages you paste in, or share/i);
  });

  it('says Cloud sync is off by default, and the defaults agree', () => {
    const points = PRIVACY_POINTS.join(' ');
    expect(points).toMatch(/Cloud sync is optional and off by default/);
    expect(DEFAULT_SETTINGS.cloudSync).toBe(false);
    // AI reading is paused, and was never assumed agreed.
    expect(DEFAULT_SETTINGS.aiReadingAccepted).toBe(false);
  });

  it('says what the server holds', () => {
    const points = PRIVACY_POINTS.join(' ');
    expect(points).toMatch(/server holds your mobile number/);
    expect(points).toMatch(/list of phones signed in with it/);
    expect(points).toMatch(/locked so it can't read them/);
  });

  it('makes no compliance, certification or approval claim', () => {
    for (const claim of ['compliant', 'certified', 'approved by', 'gdpr', 'guaranteed']) {
      expect(everything).not.toContain(claim);
    }
  });

  it('describes the provider choice as watching, not parsing', () => {
    // Stage 1 analyzes every pasted message whatever is selected, so promising
    // to parse only the chosen providers would be untrue.
    expect(SETUP_COPY.body).toMatch(/providers PesaIQ should watch/);
    expect(SETUP_COPY.body).not.toMatch(/pars/i);
  });

  it('does not claim any provider is supported', () => {
    expect(SETUP_COPY.maturity).toMatch(/experimental/i);
    expect(everything).not.toMatch(/fully supported|officially supported/);
  });
});

describe('onboarding state in the store', () => {
  let db: SqlDatabase;
  const init = () => useAppStore.getState().initialize({ database: db, now: () => NOW });

  beforeEach(async () => {
    db = await createMigratedDatabase();
    await init();
  });
  afterEach(() => db.closeAsync());

  it('starts a fresh install not onboarded', () => {
    expect(useAppStore.getState().settings.onboardingComplete).toBe(false);
  });

  it('loads the provider registry: mobile money experimental, banks demo, none supported', () => {
    const { providers } = useAppStore.getState();
    const mobileMoney = ['mpesa', 'airtel', 'mixx', 'halopesa', 'tpesa'];
    expect(providers.length).toBeGreaterThanOrEqual(12);
    for (const id of mobileMoney) {
      expect(providers.find((p) => p.id === id)?.maturity).toBe('EXPERIMENTAL');
    }
    expect(
      providers.filter((p) => !mobileMoney.includes(p.id)).every((p) => p.maturity === 'DEMO'),
    ).toBe(true);
  });

  it('remembers finishing onboarding across a restart', async () => {
    await useAppStore.getState().completeOnboarding();
    expect(useAppStore.getState().settings.onboardingComplete).toBe(true);

    await init();
    expect(useAppStore.getState().settings.onboardingComplete).toBe(true);
  });

  it('can send the user back through onboarding', async () => {
    await useAppStore.getState().completeOnboarding();
    await useAppStore.getState().resetOnboarding();
    expect(useAppStore.getState().settings.onboardingComplete).toBe(false);
  });

  it('remembers which providers the user switched off', async () => {
    await useAppStore.getState().setProviderEnabled('absa', false);
    expect(useAppStore.getState().providers.find((p) => p.id === 'absa')?.enabled).toBe(false);

    await init();
    const after = useAppStore.getState().providers;
    expect(after.find((p) => p.id === 'absa')?.enabled).toBe(false);
    expect(after.find((p) => p.id === 'mpesa')?.enabled).toBe(true);
  });

  it('does not touch saved records when onboarding is reset', async () => {
    const before = useAppStore.getState().transactions.length;
    await useAppStore.getState().resetOnboarding();
    expect(useAppStore.getState().transactions.length).toBe(before);
  });
});
