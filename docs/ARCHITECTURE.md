# PesaIQ — Architecture

Stage 1 (Expo Go). Last updated 2026-09-11, end of Phase 1A.

## Principle

Local-first. A message is pasted, parsed on device, and written to a local SQLite
database. Messages and records stay on the phone unless the user exports them.
Since 2026-09-14 the app needs an account: the mobile number and the sign-in go
through Supabase Auth (see "Sign-in with a mobile number" below).

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

| Layer         | Holds                                         | Rule                                                    |
| ------------- | --------------------------------------------- | ------------------------------------------------------- |
| `app/`        | Expo Router screens                           | No SQL, no regex. Reads through stores/selectors.       |
| `components/` | Presentational UI                             | No data fetching.                                       |
| `features/`   | Domain logic (parser, transactions, insights) | Pure and unit-testable.                                 |
| `database/`   | Schema, migrations, repositories              | The only place SQL is written.                          |
| `services/`   | `SmsSource`, export, storage                  | Side effects live here.                                 |
| `theme/`      | Design tokens                                 | Ported from the canvas; no hard-coded colors elsewhere. |
| `ai/`         | Interfaces, schemas, prompts                  | Abstraction only in Stage 1. Not wired to a provider.   |

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
  interface, so no i18n layer ships. SMS _content_ is still Swahili and the parser
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

### Duplicates

The same transaction is **never saved twice**. Each record carries a
transaction ID (`features/transactions/transactionKey.ts`):

- with a reference: the provider and the reference, ignoring case, spaces and
  punctuation (`ref:mixx:QH42T8LM9P`). The same reference from two providers is
  two transactions.
- without one: a fingerprint of the message text, ignoring case and spacing
  (`msg:` + 32 hex characters of SHA-256), so the same SMS pasted twice is still
  caught.

Saving checks for a real record with that ID first and, if there is one, stores
nothing: not the record, not the message. It notes a `DUPLICATE_DETECTED` event
against the existing record. A unique index on `transaction_key` (real records
only) catches two saves racing each other. Demo samples never block a real
record.

The Result screen asks before saving, after every edit, and offers the saved
record instead. Correcting a record's provider or reference recomputes its ID;
taking another record's is refused (`DuplicateRecordError`).

Records saved before this rule, that repeat an earlier one, keep no ID and point
at it through `duplicate_of`. Settings → Possible duplicates lists them: delete
the copy, or keep both. Deleting an original passes its ID to its oldest copy.

### Sync

`features/sync/`. Off until the user turns on Cloud sync. It runs while signed
in with the account key unlocked (`useAutoSync`): when that starts, when the
app comes back to the front, and 4 seconds after records change.

One sync (`engine.ts`):

1. **Claim the phone.** It syncs with one account. Another account's synced
   records block sync until they are deleted here. A new account key (after
   "Forgot PIN" cleared the server) means sending everything again.
2. **Pull** the rows changed since the last pull, in (server time, id) order
   from `pull_records`, reading the last 5 minutes again so a slow write from
   another phone is never missed. Applying a row twice changes nothing.
3. **Send deletions**, queued by the `transactions_sync_deleted` trigger.
4. **Send changes:** every real record whose `synced_edit` differs from its
   `updated_at`, so every local change is picked up without the store knowing
   about sync.
5. **Preferences** (`preferences.ts`): remembered categories and provider
   choices, one locked document per account. Each entry carries the time it
   was made, a forgotten category included, and the two sides merge entry by
   entry, the later winning. The merge goes back to the server if this phone
   had newer entries. Cloud sync, demo data and onboarding stay per phone.

Turning sync off asks whether to remove the server copy. **Turn off and
remove** calls `sync_clear`, which deletes the account's records and
preferences and dates it (`profiles.sync_cleared_at`). Every other phone sees
the new date at the start of its next sync (`noticeClearing`), turns its own
sync off and says why in Settings. Nothing is deleted from a phone.

Sync waits until the server confirms that the account key on this phone is
still current (`useKeyCheck` → `pin_key_is_current`, compared by verifier). After
"Forgot PIN" on another phone it isn't: the phone drops its key and asks for
the new PIN, instead of sending records locked with the old one.

### Signed-in phones

`features/devices/`. Each phone, once unlocked, checks in to `devices` on
launch and on coming back to the app (at most every 5 minutes), with a row id
kept on the phone per account and a name from the platform (Android maker and
model, iPhone or iPad, Web browser). Settings → Signed-in phones lists them,
newest first. Signing out removes this phone's row.

### AI reading

Decided 2026-09-14: networks and banks each word their messages differently,
so Claude reads a message first and the on-phone rules check it
(`features/ai/`).

1. The rules read the message on the phone, as they always have.
2. `maskForAi` masks phone, account, card and meter numbers and LUKU tokens.
3. The `parse-sms` function asks Claude Haiku 4.5 (see `BACKEND.md`).
4. `readWithAi` builds the result from Claude's reading. A field Claude left
   empty falls back to the rules. If both read the amount, fee or balance and
   they differ, the field goes to review with a warning. A known sender keeps
   the registry's name and id; a LUKU receipt keeps the rules' token, units
   and meter.
5. The person's remembered category for the recipient still wins.

`useAppStore().read` does this, and `analyzeAndSave` and the Lab use it.
`analyze` stays as the rules alone. AI reading waits for the person's agreement
(`settings.aiReadingAccepted`, given on the privacy screen or the Lab's
notice). Without it, with no connection, or over the daily cap, the rules read
the message and the result says why.

Confidence is earned by what the message states (an amount, a reference, a
date), by the two readers agreeing, and by nothing being left uncertain. Being
read by Claude adds nothing on its own. A message that isn't a money
transaction (a promotion, a code, a balance, a failed payment) is shown as
exactly that on the Result screen, with no score and nothing to save, unless
the person chooses "Save it anyway".

Rules:

- The latest edit wins, by when it was made; the server enforces it too.
- The same transaction saved on two phones becomes one record. Their
  duplicate fingerprints match, and the phones join them on pull, or when the
  server refuses the second copy.
- A record received from another phone has no SMS. Demo samples never go.

Locking (`crypto.ts`): HKDF of the account key gives a record key (AES-256-GCM,
bound to the account and the row id) and a fingerprint key (an HMAC of the
transaction ID). The payload (`payload.ts`) is the record without its local
links, as ASCII-only JSON.

### Privacy in the data layer

- `processing_events` carries ids, a kind and a short detail — **never message
  content**. Asserted by tests that serialize the table and check no counterparty,
  phone number or amount appears.
- "Remove demo data" deletes demo **messages** as well as demo transactions;
  leaving the source text would keep the sensitive half of what was removed.
- Every privacy-sensitive setting defaults to off, asserted in tests.

## Phase 1D — onboarding and navigation

### Route tree

```
app/
  _layout.tsx        root Stack; holds the splash until fonts AND the database are ready
  index.tsx          the one place a launch is routed from
  (onboarding)/      welcome → how-it-works → (sign-in) → privacy → setup
  (auth)/            phone → code                                    guard: signed out
  (tabs)/            dashboard · transactions · parser-lab · review · settings   guard: signed in and onboarded
```

Since 2026-09-14 the guards come from one rule, `features/auth/routing.ts` (see
"Sign-in with a mobile number" below).

Both groups sit behind `Stack.Protected`, so the rule is structural: Back cannot
return to onboarding once it is finished, and a deep link cannot reach the tabs
before it. Finishing onboarding, skipping it, and Settings → Replay onboarding all
flip the flag and then `router.replace('/')`; `index.tsx` re-decides. The routing
rule lives in exactly one place.

**Skip counts as finishing.** The user chose it, and every skipped screen is one tap
away in Settings.

### The tab bar is custom

The design puts a tinted pill behind the active icon and a count badge on Review;
the stock bar draws neither. `TabBar` keeps React Navigation's tap contract (emits
`tabPress`, honours `preventDefault`), so screens can still intercept taps.

In expo-router 57, `Tabs` is imported from `expo-router/tabs`, not the main entry —
the router now vendors its own copy of React Navigation.

### Icons are the design's own paths

The 2026-09-11 canvas draws its icons by hand; it contains no Lucide reference.
`components/ui/Icon.tsx` carries its SVG paths verbatim on the `react-native-svg`
already installed. An icon library would have added a dependency and been visibly
off.

### Typed routes

`npx expo start` generates `.expo/types/router.d.ts` and `expo-env.d.ts` (both
gitignored). With them present, `tsc` rejects any route string that does not match
a file — a mistyped `router.push` is a compile error rather than a runtime dead end.
On a fresh clone, run the dev server once before `npm run typecheck`, or route
strings go unchecked.

### Interim tab screens

Onboarding is complete. The tabs are working shells over real data, each marked
with a _Preview_ tag naming the phase that finishes it:

| Tab      | Real now                                                      | Arrives in                             |
| -------- | ------------------------------------------------------------- | -------------------------------------- |
| Home     | totals, review count, recent records, demo notice and removal | health, categories, tips — 1F          |
| Records  | full list from SQLite                                         | search, filters, detail — 1G           |
| Lab      | paste → analyze → save                                        | pipeline, result card, field edit — 1E |
| Review   | queue, Confirm, Ignore                                        | progress ring, field corrections — 1H  |
| Settings | Replay onboarding, remove demo data                           | toggles, providers, export — 1I        |

### Provider selection

Onboarding saves which providers the user picked (`providers.enabled`), and the
choice survives restarts. **In Stage 1 it does not change parsing**: a message the
user pastes is always analyzed. Its job is Stage 2, deciding which incoming senders
PesaIQ reads. The setup copy says exactly that, "Choose the providers PesaIQ should
watch" (decided 2026-09-11; the design's "providers you want parsed" over-promised).

## Phase 1E — Parser Lab and Result

### Flow

```
Lab (tab)                                   Result (root stack, over the tabs)
  paste / load sample
  Analyze → validate → parse (instant)
         → pipeline display, 4 × 400ms ───►  hero · warnings · fields · How we got this
                                              Edit → correct fields → Save
                                              Not correct → back to Lab, text kept
                                              Discard → back to Lab, cleared
```

The parse is synchronous and instant. The four-stage animation only paces the
display of stages that already ran; it is skipped when the OS asks for reduced
motion, and cancelled if the user leaves the tab mid-way.

### Two stores, on purpose

`features/lab/store.ts` holds the Lab session — paste box, draft, edits — and is
never persisted. The app store holds saved records. The draft travels to the
Result screen through the Lab store, **never through route params**: SMS text does
not belong in a URL.

### Edit and save rules live in one pure module

`features/lab/draft.ts` decides what an edit means, how the draft reads, and what
status a save gets. Screens render its output; tests exercise it directly.

- Only **real** changes are edits. Typing a field back to the parsed value removes
  the edit.
- **Type** is chosen from a picker. The design uses a free-text box whose value its
  own save ignores, so an edit there would silently do nothing.
- **Account / phone is read-only.** It is only ever held masked; a text box would
  invite typing a full number back in.
- An **amount is required** to save, as in the design. It must be a positive
  number; `45,000`, `45000.50` and `TZS 45,000` all read.
- A corrected record is trusted at **≥ 0.95**, as in the design.

### Save status — a deliberate departure from the design

| Situation                                                     | Design       | PesaIQ           |
| ------------------------------------------------------------- | ------------ | ---------------- |
| Confidence ≥ 0.6, nothing flagged                             | Confirmed    | **Confirmed**    |
| Confidence ≥ 0.6, a field still flagged "check" and untouched | Confirmed    | **Needs review** |
| Confidence < 0.6                                              | Needs review | **Needs review** |

The brief says low-confidence data is never treated as verified, and in the second
row nobody verified the flagged field. The button reads **"Save to review"** in that
case, so the outcome is visible before the tap.

`analyzeAndSave` still exists for unattended processing (Stage 2) and saves as
`PARSED`; only a person looking at the Result screen produces `CONFIRMED`.

### What is recorded

- The **parse result is stored as the parser produced it**; corrections live on
  the transaction. The two can always be compared.
- `TRANSACTION_CORRECTED` records **which fields** changed — never the new values.
- "Not correct" records `PARSE_REJECTED` with parser id, category and confidence,
  and nothing from the message. Tests serialize the event table and assert no name,
  phone number, amount or reference appears.

### Toasts

A single root-level `Toast` (2.4s, the design's timing) confirms outcomes. Every
toast is also announced to screen readers, since it is otherwise purely visual.

### Other departures from the design, and why

- The first pipeline stage reads "Normalize whitespace", not "…and case": the
  normalizer deliberately preserves case.
- The Lab has no Back button. It is a tab in this build, not a pushed screen.
- Swahili leftovers in the revised canvas ("Ficha" / "Onyesha", "Hakuna kiasi")
  are rendered in English, matching the rest of the revision.
- The design's save falls back to a hard-coded date when none is found. PesaIQ
  saves no date instead of an invented one.
- The engine's `formatAmount` now delegates to `utils/format`, so money reads the
  same on every screen without depending on per-device Intl data.

## Phase 1F — Home

### Layout

Greeting and date · health card (score ring, band, streak, received / sent / net;
tap the score for what builds it) · review nudge · spending / income by category ·
"Spend smarter" tips · "Earn more" tips (one at a time, see the end of this file) ·
recent transactions · by provider · demo notice.

Every figure comes from pure functions in `features/insights/` over the saved
records; the screen only lays them out.

### The health formula is locked

`features/insights/health.ts` holds the prototype's formula as the shipped one
(decided 2026-09-11): kept from income 0.40 · verified records 0.25 · low cash-out
0.20 · traceable records 0.15, bands at 80 / 60 / 40. The constants live only
there. A test runs the demo records through it and gets exactly what the design
canvas shows: received 1,450,000, sent 208,500, parts 86% / 50% / 42% / 83%,
score **68, Steady**.

### Departures from the prototype, and why

| Prototype                                               | PesaIQ                                                    | Why                                  |
| ------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------ |
| Empty ledger scores 20, "Strained"                      | "No score yet"                                            | A score built from no data misleads. |
| Ignored records count toward everything                 | Left out of score, categories, providers                  | Same rule as every other total.      |
| "6-day streak", hard-coded                              | Consecutive local days with a save or review; hidden at 0 | It should be true.                   |
| "Hello, Deo"                                            | Time-of-day greeting                                      | PesaIQ never asks for a name.        |
| Date line fixed at "Friday, 12 March 2026" (a Thursday) | Today's date                                              | —                                    |
| Tip: "PesaIQ will tell you as you approach [a cap]"     | No promise of an alert                                    | There is no budget alert.            |
| Tip: "…ready for a loan or a tax filing"                | "…ready when you need to show them"                       | No claim about lending or tax use.   |
| "One source carries N%" whenever there is income        | Only when one source is a majority                        | "Most of your income" must be true.  |
| "1 records carry", lowercase sentence starts            | Correct plurals and capitals                              | —                                    |
| Weight labelled "uzito" (Swahili leftover)              | "weight"                                                  | English UI.                          |
| Provider summary computed, never shown                  | Compact "By provider" card                                | The brief requires it.               |
| Review nudge and bell dot always shown                  | Only when something is waiting                            | "0 need review" is noise.            |

### The streak

Built from `processing_events`: saves (including flagged duplicates), confirmations
and corrections. A streak last extended yesterday is still alive, so opening the app
in the morning never shows a reset. It counts local days, not UTC days. Clearing
processing history clears the streak, because that history is what it is made of.

### Motion

The score counts up (860ms, linear) as the ring fills, and the bars grow in (750ms,
the design's `cubic-bezier(.2,.85,.2,1)`) after 160ms. Both replay on each visit to
Home and whenever the score changes, and both are skipped under reduced motion.

### Not decided yet

Totals are all-time: the design has no period selector. A month/30-day view is a
product decision for later, and every insight function already takes the record
list, so filtering it first is the whole change.

## Web preview target

Added after 1F so screens can be seen and checked in the desktop app's in-app
browser. PesaIQ remains an Android-first app; web is a development aid, not a
shipped platform.

### What it took

- **`react-native-web` 0.21**, the version SDK 57 pins. `react-dom` stays pinned
  at 19.2.3 to match React.
- **`metro.config.js`** adds `.wasm` as an asset extension, because expo-sqlite
  runs on web as WebAssembly (wa-sqlite) inside a worker. Native builds never
  request a `.wasm` file: with the config alone changed, the Android bundle hash
  was byte-identical.
- **No cross-origin-isolation headers.** expo-sqlite needs `SharedArrayBuffer`,
  and so COOP/COEP, only for its synchronous API. PesaIQ uses the async API
  exclusively, which reaches the worker by message passing. Verified: the page
  is not cross-origin isolated, and records and settings survive a reload. (The
  headers were first tried through Metro's `enhanceMiddleware`, but they never
  reached the HTML document and turned out to be unnecessary, so they were
  removed.) `database/client.ts` records why it must stay async-only.

### One tab at a time

On web the database lives in the browser's origin-private file system under an
exclusive lock, so a second tab cannot open it. The boot screen now says
"PesaIQ is already open in another tab or window. Close the other one, then tap
Try again." instead of showing the raw `NoModificationAllowedError`. This cannot
happen on Android, where the app runs as a single instance.

### Web fixes that also tidy native

- Icons are hidden from assistive technology by a wrapping `View aria-hidden`.
  react-native-svg forwards unknown props to the DOM on web, so React Native
  accessibility props on `<Svg>` leaked as stray attributes.
- The health ring's stroke follows the count-up number instead of an animated
  SVG prop. On web, `Animated` forwarded `collapsable` onto the DOM `<circle>`.
- `pointerEvents` is a style rather than a prop (the prop is deprecated on web).
- On web, shadows are the design's own CSS `boxShadow`; Android keeps
  `elevation` and iOS the `shadow*` props.
- The spending total wraps onto a second line, as in the design, instead of
  relying on shrink-to-fit, which web does not support.

### Running it

- In the desktop app's preview: `.claude/launch.json` (local and gitignored) runs
  `npm run start -- --port 8082`. Port 8081 stays free for `npm start` and
  Expo Go on a phone.
- In any browser: `npm run web`.

### Verified in the preview at 375 × 812

Home (ring, parts, nudge, categories, recent, providers), Records, the Parser
Lab, Result (bank sample, analyzed: counterparty flagged at 62%, button reads
"Save to review", Discard returns to the Lab and saves nothing), Review,
Settings, and the whole onboarding flow replayed from Settings (Welcome, How it
works, Privacy with its disclaimer, Setup with the "should watch" copy and all
ten providers), ending back on Home with the onboarding flag restored. The app
fills the viewport exactly: the root and the tab bar end at 812 of 812 px. The unfiltered dev-server log showed no errors or warnings once the
fixes above were in.

## Phase 1G — Records and transaction detail

### Records

The design's search box and chips (All · Received · Sent · Cash out · Bills ·
Review) over every record, grouped by day. Order and grouping follow **when the
transaction happened**, as the message states it, not when it was saved. An old
message pasted today files under its own date. Dates the parser cannot read fall
back to the save time. The list is a `SectionList`, so a long history stays fast.

Search matches the counterparty, reference, provider, masked number and amount
("45,000" and "45000" both work), ignoring case.

**Beyond the design:** the brief also asks for provider and date filters. They sit
behind a "More filters" chip, which shows how many are active, so the design's own
layout is unchanged by default. The empty state tells "no records yet" (with
Analyze an SMS) apart from "no records match" (with Clear filters).

### Detail

The design's layout: type and status pills, amount, a small confidence ring with
"Rules · no AI", the fields with a caution mark on unsure ones, and the source
message. `PARSED` reads "Unconfirmed", since "parsed" means nothing to a person. The
"Rules · no AI" tag is there because the brief asks for AI-made records to be
marked; none exist yet.

### Departures from the design, and why

| Design                                               | PesaIQ                                                           | Why                                                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Edit shows "opens the field-by-field form"           | A real editor; saving confirms the record                        | Reuses the Lab's `FieldRow` and money parsing, so "45,000" means the same everywhere |
| Delete removes the record on one tap                 | Asks first, in-app                                               | It cannot be undone; `Alert.alert` does nothing on web                               |
| Delete leaves the source message                     | Deletes the message and its parse result too                     | Otherwise the SMS text, the most sensitive part, stays behind                        |
| Source message shown raw, full phone number included | Phone and account numbers masked, "Show full numbers" on request | The brief: never expose full numbers unnecessarily                                   |
| —                                                    | Confirm needs an amount                                          | Confirming says the record is right; one with no amount is not                       |

The stored message is never altered: masking is display-only
(`utils/privacy.ts`), in the same format the extractor uses (`07** *** 678`,
`**** 1234`). A delete removes the record and its message in one database
transaction, and keeps a message that another record still points at.

`TRANSACTION_CORRECTED` records which fields an edit changed, never the values, as
in the Lab.

Home's recent rows now open the record's detail too.

## Dependency note — Expo 57.0.22 and `expo-modules-core`

`npx expo install --fix` (run 2026-09-11) moved the project to Expo 57.0.22: twenty
patch-level updates across the `expo` family, nothing else.

With it, npm places `expo-modules-core` 57.0.18 **nested under `node_modules/expo`**
rather than at the top level. The installed `react-native-worklets` 0.12.2 (pulled
in by `expo-router` → `@expo/ui` and by `react-native-reanimated`) is outside
`expo-modules-core`'s optional peer range, `^0.7.4 || ^0.8.0 || ^0.9.0 || ^0.10.0`,
so npm isolates it. `npm ci` and `npm dedupe` both keep it there: this is the
lockfile's resolution, not a broken install.

- **The app is unaffected.** Metro resolves it for both bundles; the Android and
  web exports both succeed.
- **Jest was affected.** jest-expo's setup requires `expo-modules-core` by bare
  name, and plain Node resolution only looks at the top level. `jest.config.js`
  now maps it to wherever `expo` itself resolves it, so the tests work whether npm
  nests or hoists it.

**On Windows, stop dev servers before installing.** The upgrade ran while a Metro
dev server was watching `node_modules`. Metro then reported files as missing, and
a clean `npm ci` was needed before everything resolved again.

## Phase 1H — Review queue

### Layout

The design's screen: a "Cleared this week" ring beside the day streak, then one
card per record that needs review. Each card has an initials tile, the amount, the
provider and date, and a confidence pill. Below that come type chips, the fields to
check as inputs (flagged ones outlined), and **Save & confirm** / **Ignore**. An
empty queue shows "The queue is clear". Tapping a card's header opens the record's
detail.

### Real numbers, not the prototype's

| Prototype                                 | PesaIQ                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| "2/7 cleared", hard-coded and capped at 7 | Confirm, correct and ignore actions since Monday 00:00 local, against the design's target of 7 (one constant) |
| "6-day streak", hard-coded                | The same streak Home shows                                                                                    |

Both are built from `processing_events`, so clearing processing history resets
them.

### Behaviour

- **The fields asked** are the design's three (amount, counterparty, reference),
  plus any other editable field the parser flagged, so nothing it was unsure about
  goes unasked. The masked number is never an input; the type has chips (the
  design's five, plus the record's own type if it is not one of them).
- **Save & confirm** uses the detail editor's rules (`buildRecordPatch`): only real
  changes count, money reads the same everywhere, and an amount is required. With
  nothing changed, it simply confirms.
- **Ignore** marks the record `IGNORED`: it stays in Records but leaves the queue,
  the totals and the score. It is now logged as `TRANSACTION_IGNORED` (with no
  content) and counts toward the streak, since reviewing is activity.

### Resolved: "Very high" and yet "needs review"

The overall score measures how much the parser **found**; a flag measures how sure
it is about **one field**. A record could read "Very high · 98%" and still go to
review. With fields flagged, the confidence now reads **"98% overall · 1 to
check"**, in the check colour, on the Result and Detail screens. The scoring is
unchanged, and with nothing flagged the label reads exactly as before.

## Phase 1I — Settings, export and privacy

### Settings

The design's groups, in order: Processing, Privacy, AI · fallback, Providers,
Data, then the Stage 1 card with **Replay onboarding →**.

| Row                                           | Behaviour                                                                                                                                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Automatic processing, Cloud sync, AI fallback | Switches shown **locked off**. None exists in Stage 1, so a switch that could be turned on would promise something that does not happen (a "Cloud sync: on" suggests a backup). Each says why.                  |
| SMS source, On-device parsing, AI provider    | Status tags, as designed.                                                                                                                                                                                       |
| Providers                                     | From the registry: maturity tag (Demo / Experimental / Supported) and whether the user watches it. Never labelled beyond its maturity.                                                                          |
| Delete all transactions                       | Removes every record **and its source message** (the 1G rule, applied in bulk), in one database transaction. Also turns demo data off, since seeding would otherwise bring the samples back on the next launch. |
| Delete all messages                           | Removes the source text; parse results cascade and records keep their data with no source.                                                                                                                      |
| Clear processing history                      | As before; the streak and "cleared this week" reset with it.                                                                                                                                                    |
| Remove demo data                              | As before. Shown only while demo data is on.                                                                                                                                                                    |

Every destructive row asks first, in place ("Delete permanently" / "Keep"), and
reports what happened in a toast.

### Export

`features/export/format.ts` is pure; `services/export/saveExport` writes.

- **Format:** CSV (the brief's header: `Date,Type,Provider,Amount,Currency,Sender,Reference,Confidence`)
  or JSON (every field worth keeping, plus notes saying what is not included).
- **Range:** 7 days, 30 days or All, measured the same way as Records' periods.
- **What goes out:** saved records only. Demo samples are left out and counted on
  screen: a CSV has no column to mark them, so in a spreadsheet they would pass for
  real. Source messages are never exported; identifiers stay masked.
- **CSV safety:** RFC 4180 quoting with CRLF line endings, a UTF-8 BOM so Excel
  reads names correctly, and cells starting with `= + - @` prefixed with `'`. Those
  values come from SMS text anyone can send, and a spreadsheet would run them as
  formulas.
- **Dates:** ISO `YYYY-MM-DD`, and empty when the message carried no date, rather
  than quietly using the day it was saved (`parsedRecordDate`).
- **Saving:** on Android, `Directory.pickDirectoryAsync()` (the system folder
  picker) and `createFile`, so the file lands where the user chose and nothing is
  shared. On the web, a browser download. Cancelling the picker saves nothing.
  `expo-file-system` became a direct dependency; it ships in Expo Go.

### Fixed along the way

Both were found while verifying 1I in the browser:

- **Checked state on web.** react-native-web does not carry
  `accessibilityState.checked` over to `aria-checked`, so a screen reader could not
  tell which type chip, provider, format or range was selected, or whether a switch
  was on. Every checkable control now sets `aria-checked` as well (Review chips, the
  Lab's type picker, onboarding providers, Export, `Switch`).
- **Toast hidden behind pushed screens.** The toast had no z-order, so on web the
  Export screen painted over it and "Saved …" was never seen. It now sits on its own
  layer above every screen.

## Phase 1J — Hardening

### Accessibility

- **Contrast.** Every text-on-background pair the app draws was measured against
  WCAG AA (4.5:1 for small text); `tests/contrast.test.ts` now pins them. What
  failed, and the fix:

  | Pair                                            | Before   | Fix               | After  |
  | ----------------------------------------------- | -------- | ----------------- | ------ |
  | Muted text (`tone="muted"`)                     | 4.1–4.45 | alpha 0.58 → 0.66 | ≥ 5.26 |
  | Faint text                                      | 2.9      | alpha 0.45 → 0.62 | ≥ 4.63 |
  | "Not found" values, placeholders (`neutral500`) | 2.4      | `neutral700`      | ≈ 6    |
  | Selected type chip (white on lime-500)          | 1.9      | `accent2-900` ink | 6.2    |
  | `tone="positive"` on the page ground            | 4.3      | `accent2-800`     | 6.9    |

  The design's own values were the ones below AA; each change is the smallest step
  that clears it.

- **Text size.** All text follows the phone's font-size setting. Only the tab
  labels (1.4×) and the tab badge (1.2×) are capped, because their containers are
  fixed-size and would clip.
- **Touch targets and names.** An audit of all 23 pressables found each with a role
  and an accessible name, and none under 44 px without hit slop to reach 48 px.
- **Keyboard.** Scrolling a form puts the keyboard away; taps still land while it is
  open.

### Errors

- **Root error boundary.** A screen that throws while rendering shows "Something
  went wrong" with **Try again**, instead of a blank screen. It never shows the
  error's text, which could quote a pasted message.
- **Parser robustness.** `tests/robustness.test.ts` feeds the parser 27 hostile
  inputs (emoji, right-to-left text, control and zero-width characters, markup,
  SQL, absurd or negative amounts, 500-character references) and 500 generated
  messages from a fixed seed. Each must give a valid result with finite numbers,
  masked identifiers and real dates. The same inputs also go through the store and
  SQLite and come back intact.
- **Bugs it found, now fixed.** The date extractor formatted whatever matched
  `dd/mm/yy`: month 99 became "12 ? 2026", 31/02 became "31 Feb 2026", "25:61" was
  kept as a time, and a four-digit "1999" became "2099". It now takes the first
  real date and the first possible time; anything else is null with a "not a real
  date" warning, and the record's date falls back to when it was saved.

### Empty, loading and error states

| Screen            | Empty                                                        | Loading           | Error                                                                   |
| ----------------- | ------------------------------------------------------------ | ----------------- | ----------------------------------------------------------------------- |
| Launch            | —                                                            | "Opening PesaIQ"  | "Could not open your records" + Try again (and the one-tab note on web) |
| Home              | "No score yet" + Analyze an SMS                              | —                 | Toast if demo removal fails                                             |
| Records           | "No records match" / nothing saved                           | —                 | —                                                                       |
| Lab / Result      | "Paste a message before analyzing"; "Nothing to show"        | Pipeline progress | Too long, could not analyze, could not save                             |
| Review            | "The queue is clear"                                         | Button spinners   | "Nothing was changed"                                                   |
| Detail            | "Record not found"; "no longer stored" for a deleted message | "Loading…" source | Save and delete failures                                                |
| Settings / Export | Delete disabled with no records; "Nothing to export"         | Button spinners   | "Nothing was changed"; "could not be saved"                             |
| Any screen        | —                                                            | —                 | Root error boundary                                                     |

### Test runner note

Jest now and then prints "a worker process has failed to exit gracefully" under
parallel load. A full in-band run with `--detectOpenHandles` reports no open handles,
so this is slow worker teardown, not a leak in the code under test.

## Fees, taxes and categories (Stage 1 addition, 2026-09-12)

Asked for after 1J, from real Mixx and LUKU messages. The parser side is
documented in `PARSER_ENGINE.md`.

### Data

Migration v2 adds four columns to `transactions`:

- `money_category`
- `fee`
- `taxes`: JSON tax lines
- `details`: JSON holding the receipt, network, merchant flag, and LUKU units,
  meter, token, price and debt

It also adds a `category_rules` table (recipient → category) and marks Mixx
EXPERIMENTAL. Older records keep working: when shown, their category comes from
the same rules.

Migration v3 adds `transaction_key` and `duplicate_of` to `transactions` (see
Duplicates). A migration can carry an `after` step, run in the same transaction
as its SQL, for work SQL can't do. v3's gives every record its ID, oldest
first, marks later repeats as copies of the first, then adds the unique index.

Migration v4 adds sync's bookkeeping: `sync_id` and `synced_edit` on
`transactions`, a `sync_deletions` table filled by a delete trigger, and
`sync_state` (see Sync).

Migration v5 dates each preference change for sync: a
`category_rule_deletions` table filled by a delete trigger (cleared when the
category is learned again), and `providers.enabled_at`, stamped by a trigger
when a provider is switched.

### Money arithmetic (`features/transactions/money.ts`)

Three figures always reconcile: **spent** (what the money bought) plus **fees &
taxes** equals **total out** (what left the balance). For Mixx, 5,000 + 450 =
5,450. For LUKU, whose taxes sit inside the total, 16,663.94 + 3,336.06 = 20,000.

Fees are shown apart, as the user chose:

- Home shows Received, **Spent** and Net. Net is after fees.
- Category breakdowns count what was spent; fees and taxes have their own card.
- The health score's "kept from income" uses total out, and the tips' cash share
  uses spent. On the demo data the score stays 68. The demo transfer's own "Ada
  TZS 1,000" now counts, so Net is 1,000 lower than the design canvas showed,
  and low cash-out rounds to 43% instead of 42%.

### Screens

- **Home:** a "Fees & taxes this month" card opens `app/fees.tsx`. That screen
  shows a period (this month, last month, all time), the total, and the total
  split by type and by provider. The types are operator fees (agent fees on
  withdrawals included), VAT, EWURA, REA and levies. It also lists the records. The lines
  always add up to the total (`chargeLines`).
- **Result:** an "Operator fees + Taxes = Fees & taxes · Total out" line;
  Category, Fee as stated and Taxes rows;
  LUKU Units, Meter and Token, with the token masked.
- **Detail:** Category and Fee rows, Receipt and "Sent to" rows, a Fees & taxes
  card, and an Electricity card with **Show token**.
- **Review and the editors:** a category picker (violet chips, so they read apart
  from the lime type chips). The fee is editable.
- **Settings:** Remembered categories, with **Forget**. Delete all transactions
  forgets them too, because they hold recipient names.
- **Export:**
  - CSV gains Category, Operator fees, Taxes, Fees & taxes and Total out.
  - JSON gains the category, the fee, the tax lines, the totals, the receipt,
    the network and the LUKU details.
  - Neither ever includes the token.

### Remembered categories

Only an explicit pick is remembered, in the Lab, on the Detail screen or in
Review. A category the rules pick again after a type change is not.

## Reports (Stage 1 addition, 2026-09-12)

A monthly summary, on screen and as a PDF. It opens from Home's **Monthly report**
card and from the **Report** button on Records.

### Period (`features/reports/period.ts`)

- **Month:** step back through the months. Forward stops at the current month.
- **Custom range:** type From and To as DD/MM/YYYY (day first, like the
  messages), or pick a preset: last 7 days, last 30 days, this year. Both days
  count in full.
- Every period is compared with the one before it: the previous month for a
  month, or the same number of days just before a range.

### Summary (`features/reports/summary.ts`)

The summary is pure. It uses the same per-record arithmetic as Home (`spentOf`,
`chargesOf`), so a report never disagrees with the app. Ignored and failed
records are left out, as they are everywhere else.

- **Totals:** money in, spent, fees & taxes, and net (money in − spent − fees &
  taxes).
- **Fees & taxes, split:** operator fees (each fee less the VAT inside it,
  `feeBeforeTaxOf`) and taxes (every tax line). The two add up to fees & taxes,
  on screen and in the PDF.
- **Breakdowns:** spending and income by category, and fees & taxes by type
  (`chargeLines`). Each line has its share and the same line in the period before.
  A line that has stopped since then is kept, at zero.
- **Records still in review** are counted, with a note that the totals may change.
- **Demo records** are counted and flagged, on screen and in the PDF.

### PDF

`features/reports/html.ts` builds a self-contained A4 page: inline styles, no
fonts or images to fetch. It carries totals and categories only: no names, phone
or account numbers, references or message text. Labels are HTML-escaped.

- **Android** (`services/reports/saveReportPdf.ts`):
  - The user picks a folder first. Backing out saves nothing.
  - `expo-print` renders the page to a PDF in the app's cache.
  - Its bytes are written into the folder, and the cache copy is deleted.
- **Web** (`saveReportPdf.web.ts`):
  - The page is printed from a hidden frame, where the browser offers "Save as
    PDF". `expo-print`'s web build would print the whole app page instead.
  - The browser does not say whether the file was saved.
- **File name:** `pesaiq-summary-2026-09.pdf` for a month, or
  `pesaiq-summary-2026-09-01-to-2026-09-15.pdf` for a range.

## Home: score info and tip carousels (2026-09-12)

- **What builds your score** is no longer a card on Home. The score area of the
  health card, marked with an info tag, opens it in a floating window
  (`ScoreInfoModal`, a React Native `Modal`). A tap outside, the close button or
  Android's back button closes it. The bars grow again on each opening.
- **Tips** show one at a time in each section (`TipCarousel`). Swipe, tap a dot,
  or let them move on every 6 seconds. Autoplay:
  - stays off with reduce motion or a screen reader
  - waits 12 seconds after the user moves the tips
  - stops while Home is out of view
  - has a pause button (WCAG 2.2.2).

  The paging arithmetic is in `utils/carousel.ts`.

## Operator fees + taxes = fees & taxes (2026-09-12)

Everywhere fees and taxes appear, they are shown as one sum. It is worked out by
`splitCharges` and written out by `chargesEquation`, both in
`features/insights/fees.ts`.

- **Operator fees:** what the provider or agent charged, less any VAT inside the
  fee (`feeBeforeTaxOf`). A cash withdrawal's agent fee counts as one.
- **Taxes:** every tax line: VAT, excise, levies, EWURA, REA.
- **Fees & taxes:** the two added up. This always equals `chargesOf`.

Where it appears:

- **Detail card and Fees & taxes screen:** as rows (`ChargesBreakdown`). Several
  taxes are listed under Taxes; a single one is named beside it.
- **Home:** the Fees & taxes card, and a line under the health card's figure.
- **Result screen:** its summary line.
- **Fees & taxes screen:** each record's line.
- **Report:** on screen and in the PDF.
- **Export:**
  - CSV: `Operator fees,Taxes,Fees & taxes` columns.
  - JSON: `operatorFees`, `taxesTotal` and `feesAndTaxes`.

The fee field is labelled **Fee as stated**. It is the message's own figure,
with any VAT inside it.

## Sign-in with a mobile number (2026-09-14)

PesaIQ needs an account: a Tanzanian mobile number, confirmed by a 6-digit code
sent by SMS. Supabase Auth makes the code and the `send-sms` hook sends it (see
`docs/BACKEND.md`).

- **Order:** Welcome → How it works → **Mobile number → Code** → Privacy →
  Senders. Someone who has already seen the intro, or who signed out, goes
  straight to the number screen and then into the app.
- **One rule for where people can go** (`features/auth/routing.ts`):
  - the intro, until signed in and onboarded
  - sign-in, only while signed out
  - Privacy and Senders, once signed in
  - the app, only when both

  The root layout's guards and the launch redirect both read it.

- **Numbers** (`features/auth/phone.ts`): `0713…`, `713…`, `+255 713…` and
  `255713…` are all accepted, and kept as 255 plus nine digits starting with 6
  or 7. The server hook applies the same rule.
- **Code screen:** checks the code as soon as six digits are in (phones can fill
  it in from the SMS). A new code can be asked for once a minute, and the number
  can be changed.
- **Errors** (`features/auth/errors.ts`) say what to do next, never the
  service's own words. Supabase's client calls both a lost connection and any
  server error "retryable"; only status 0 is shown as a lost connection.
- **Session:** kept in the phone's secure storage
  (`features/auth/chunkedStorage.ts`), split into chunks because secure storage
  refuses values over 2048 bytes on some iPhones. It refreshes only while the
  app is in front. The web preview keeps it in the browser.
- **Sign out** (Settings → Account) affects this phone only
  (`scope: 'local'`). Records stay on the phone.
- **Without the Supabase settings** in `.env`, the app says sign-in isn't set
  up, instead of failing later.
- **Service boundary:** `features/auth/store.ts` talks to an `AuthApi`.
  `services/supabase/authApi.ts` is the Supabase one; tests use a fake.

Not built yet: encrypted sync, the profile screen and account deletion.

## The PIN and the account key (2026-09-14)

After signing in, a phone needs the **account key**: 32 random bytes that
will lock the records that sync. A **4-digit PIN** unlocks it. There is no
recovery key (decided 2026-09-14).

- **Order:** Number → Code → **Create PIN** (entered twice) or **Enter PIN**
  (a phone that doesn't hold the key yet) → Privacy → Senders. The routing
  rule gained a third fact: whether this phone holds the key.
- **Why a guess limit:** 10,000 PINs could all be tried in minutes against a
  copy of the database. So a PIN can only be tested through the `pin-oprf`
  Edge Function, which counts every guess first: 5 tries, then waits of 1
  minute, 5 minutes, 1 hour, then a day. There is never a permanent lock.
- **How the server never sees the PIN** (`features/pin/crypto.ts`):
  1. The phone hashes the PIN to a point on ristretto255 and blinds it with a
     random number.
  2. The function multiplies the point by a per-user key derived from
     `PIN_OPRF_SECRET`. This is an oblivious pseudorandom function, or OPRF.
  3. The phone unblinds the answer and hashes it. That gives a secret that
     exists only for the right PIN plus the server's secret.
  4. Through HKDF, that secret locks the account key with AES-256-GCM. Only the
     locked key is stored (`account_keys`).
- **The guess count** lives in `pin_guard`, which no app can read or write, and
  is changed only by three database functions:
  - `pin_attempt` counts a guess. Nothing is counted before the account has a
    key.
  - `pin_confirm` takes a verifier (an HMAC under the account key) and resets
    the count after a correct PIN.
  - `pin_reset` handles "Forgot PIN?" by deleting everything synced to the
    account.
- **On the phone:** the opened key is kept in secure storage, on this device
  only (`services/keyStore.ts`), so the PIN isn't asked for on every launch.
  Sign out removes it.
- **Common PINs** are refused: four of a digit, runs like 1234, and pairs like 1212.
- **Libraries:** `@noble/curves`, `@noble/hashes` and `@noble/ciphers`. They are
  audited, pure JavaScript, and run in Expo Go. Randomness comes from
  `expo-crypto`.
- **Tests** (`tests/pin.test.ts`) cover the protocol against a simulated server
  doing the real maths: the same PIN gives the same secret under different
  blinds, a wrong PIN, salt or account opens nothing, and the store's create,
  unlock, wait and start-over paths.
