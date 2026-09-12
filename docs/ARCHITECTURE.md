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

## Phase 1D — onboarding and navigation

### Route tree

```
app/
  _layout.tsx        root Stack; holds the splash until fonts AND the database are ready
  index.tsx          the one place a launch is routed from
  (onboarding)/      welcome → how-it-works → privacy → setup      guard: !onboarded
  (tabs)/            dashboard · transactions · parser-lab · review · settings   guard: onboarded
```

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

Greeting and date · health card (score ring, band, streak, received / sent / net) ·
what builds the score · review nudge · spending / income by category · "Spend
smarter" tips · "Earn more" tips · recent transactions · by provider · demo notice.

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
