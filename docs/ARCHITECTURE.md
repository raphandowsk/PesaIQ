# PesaIQ — Architecture

Stage 1 (Expo Go). Last updated 2026-09-11, end of Phase 1A.

## Principle

Local-first. A message is pasted, parsed on device, and written to a local SQLite
database. Nothing leaves the phone unless the user exports it.

## Data flow

```
Paste (ManualSmsSource)
      ↓
Normalizer          original text preserved, never mutated
      ↓
Classifier          12 categories + explainable reasons[]
      ↓
Parser engine       GenericParser + provider hints
      ↓
ParseResult         Zod-validated, per-field confidence
      ↓
Confidence          weighted factors → band
      ↓
User confirms / edits
      ↓
TransactionRepository → SQLite
      ↓
Selectors (pure)    health · categories · tips · totals · filters
      ↓
Dashboard
```

## Layers

| Layer | Holds | Rule |
|---|---|---|
| `app/` | Expo Router screens | No SQL, no regex. Reads through stores/selectors. |
| `components/` | Presentational UI | No data fetching. |
| `features/` | Domain logic (parser, transactions, insights) | Pure and unit-testable. |
| `database/` | Schema, migrations, repositories | The only place SQL is written. |
| `services/` | `SmsSource`, export, storage | Side effects live here. |
| `theme/` | Design tokens | Ported from the canvas; no hard-coded colors elsewhere. |
| `ai/` | Interfaces, schemas, prompts | Abstraction only in Stage 1. Not wired to a provider. |

**UI never touches SQLite directly.** Screens call repositories or selectors. This
is what lets the prototype's in-memory state become real persistence without
rewriting view code.

## The Stage 2 seam

SMS ingestion is behind one interface:

```ts
interface SmsSource {
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

Stage 1 ships `ManualSmsSource` (pasted text) only. Stage 2 adds `AndroidSmsSource`
(BroadcastReceiver + native module, Expo Dev Build) behind the same interface.
Everything downstream of the source is unchanged. **No native SMS code exists yet
and none is faked.**

## Phase 1A — what is built

- Expo SDK 57 · React Native 0.86.3 · React 19.2.3 · TypeScript 6, Expo Router with
  typed routes.
- `theme/` — colors, ramps, spacing, radii, type scale, violet-tinted elevation,
  ported from the 2026-09-11 canvas revision.
- `components/ui/` — `Text`, `Card`, `Button`, `Tag`, `Screen`.
- Plus Jakarta Sans loaded at the root behind the splash screen.
- ESLint (flat config) + Prettier + Jest (`jest-expo`).
- `app/index.tsx` is a temporary foundation check; Phase 1B replaces it.

## Decisions

- **Zustand** for app state (the prototype is one reactive store; Zustand maps to it
  cleanly). Added in Phase 1C when there is state to hold.
- **English-only UI.** The 2026-09-11 design revision removed Swahili from the
  interface, so no i18n layer ships. SMS *content* is still Swahili and the parser
  must match Swahili keywords.
- **`react-dom` is pinned to 19.2.3** to match the React version Expo pins. A
  hoisted 19.3.0 otherwise breaks peer resolution.

## Phase 1C — the data layer

### The database port

Repositories depend on a `SqlDatabase` interface, not on expo-sqlite. Two things
follow: repositories are tested against **real SQL** via Node's built-in
`node:sqlite` (no mocks, no new dependency, nothing bundled into the app), and
swapping the driver later touches one file.

### Schema

Six tables at `user_version = 1`, migrated idempotently on every launch:

```
messages ──< parse_results
    │              │
    └──────────────┴──< transactions
providers   processing_events   settings
```

`parse_results.payload` holds the whole result as JSON rather than exploding it
into columns. It is written once and read whole by "How we got this", the indexed
columns beside it cover every query we run, and exploding it would mean a
migration each time the parser gains a field.

### What the store owns

`useAppStore` (Zustand) holds the database handle, the settings and the
transaction list. Screens call actions; they never see SQL. `initialize({
database, now, makeId })` is the test seam — the clock and id generator are
injected, so store tests are deterministic.

`analyzeAndSave` writes the message, the parse result and the transaction in one
transaction, so a failure partway leaves nothing behind.

### Duplicate detection

A repeated `transaction_reference` is **flagged, not dropped**. It is a strong
hint rather than proof, and silently discarding a real transaction is worse than
showing a duplicate the user can delete. Messages with no reference cannot be
de-duplicated at all, which is why the parser warns about it.

### Privacy in the data layer

- `processing_events` carries ids, a kind and a short detail — **never message
  content**. Asserted by tests that serialize the table and check no counterparty,
  phone number or amount appears.
- "Remove demo data" deletes demo **messages** as well as demo transactions;
  leaving the source text would keep the sensitive half of what was removed.
- Every privacy-sensitive setting defaults to off, asserted in tests.
