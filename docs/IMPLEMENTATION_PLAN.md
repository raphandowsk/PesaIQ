# PesaIQ — Android Implementation Plan (Stage 1)

_Derived from the design canvas at `Android app design questions/PesaIQ Android.dc.html`, the
`Violet` inline design tokens (the canvas no longer references `_ds/`), and `PesaIQ_BUILD_PROMPT.md`. Target: an Expo Go
app where you paste a Tanzanian financial SMS, watch it parse, confirm/edit, and save._

---

## 1. What the design tells us (and where it extends the original brief)

The clickable prototype is **more than the original MVP spec**. Confirmed additions I will build:

| Area              | The design specifies                                                                                                                                                                                                                                                                       | Impact on plan                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Language**      | **English-only UI** (revised 2026-09-11 — Swahili removed). Nav: Home, Records, Lab, Review, Settings. SMS _content_ can still be Swahili.                                                                                                                                                 | No i18n layer needed. Parser must still match Swahili keywords.                                |
| **Design system** | **Violet/lime on near-white** (revised 2026-09-11, replaces Organic): accent `#8a4fd8`, accent-2 `#6aad39`, bg `#f7f6fc`, surface `#ffffff`, text `#16151c`. Plus Jakarta Sans (800 headings). Radii 12/20/30.                                                                             | A `theme` tokens module + one font family. Not Material default.                               |
| **Dashboard**     | Personalized greeting, **Financial Health score 0–100** (animated ring) with 4 weighted factors, "what builds the score" bars, In/Out/Net, **category breakdown** (spend/earn toggle), **insight tips**, provider summary, recent list, review count, "Analyze SMS" CTA, demo-data banner. | New `insights` feature (pure selectors over transactions). Bigger than the original dashboard. |
| **Parser Lab**    | Paste box + char count + clear, 4 labeled DEMO samples, animated 4-step pipeline, rich result card.                                                                                                                                                                                        | Matches brief; pipeline animation is cosmetic.                                                 |
| **Result**        | Per-field confidence, warnings, **"How we got this"** explainability (1 Normalized · 2 Classified · 3 Confidence factors with deltas), inline field edit, Save / Not-correct / Discard.                                                                                                    | Matches brief + explainability.                                                                |
| **Transactions**  | Search, filter chips (All / Received / Sent / Cash out / Bills / Review), date-grouped rows, masked identifiers, needs-review flag, empty state.                                                                                                                                           | Matches brief.                                                                                 |
| **Detail**        | Full fields, confidence ring, source message "kept intact", Confirm/Edit/Incorrect/Delete.                                                                                                                                                                                                 | Matches brief.                                                                                 |
| **Review**        | Progress ring (x/7 cleared this week), day streak, per-item type chips + inline inputs for low-confidence fields, Confirm / Ignore.                                                                                                                                                        | Matches brief + gamification.                                                                  |
| **Settings**      | Grouped: Processing / Privacy / AI / Providers / Data, toggles + actions + status tags, replay onboarding.                                                                                                                                                                                 | Matches brief.                                                                                 |
| **Export**        | Format (CSV/JSON), range, live preview + row count, "runs only on tap".                                                                                                                                                                                                                    | Matches brief.                                                                                 |
| **Onboarding**    | Welcome, How-it-works (4 steps), Privacy (non-legal disclaimer), **Senders/providers picker**, setup.                                                                                                                                                                                      | One extra step vs. brief.                                                                      |

> **The parser is real in the prototype.** The design's embedded script contains a complete,
> working `normalize → classify → extract → confidence` engine with 4 anonymized DEMO samples
> and 6 seed transactions. **I will port this engine verbatim into typed modules** rather than
> re-invent it — it is the de-risked source of truth for Stage 1 behavior, and unit tests will
> lock it in place.

---

## 2. Architecture (Stage-2-ready, Expo Go-safe)

```
Paste (ManualSmsSource)
   → Normalizer → Classifier → GenericParser(+provider hints)
   → ParseResult (Zod-validated) → Confidence
   → Review/Confirm → TransactionRepository (SQLite)
   → Selectors: health / insights / categories / totals → Dashboard
```

- **No native modules in Stage 1.** SMS ingestion goes through an `SmsSource` interface; Stage 1
  ships only `ManualSmsSource` (pasted text). Stage 2 adds `AndroidSmsSource` behind the same
  interface — no rewrite. The interface and its call site are the single seam.
- **UI never touches SQLite.** Screens read through repositories + pure selectors. This keeps the
  design's "everything in React state" prototype swappable for real persistence without touching
  view code.
- **Health/insights/categories are pure functions** over the transaction list (no new tables).

### Folder layout (matches the build prompt, adjusted for what the design added)

```
app/                      # Expo Router screens (tabs + stacks)
  (onboarding)/ welcome, how-it-works, privacy, senders, setup
  (tabs)/ dashboard, transactions, parser-lab, review, settings
  transactions/[id], result/index, export/index
theme/                    # Violet tokens: colors, ramps, type, spacing, radius, shadow
components/ui|dashboard|transactions|parser|review   # shared building blocks
features/
  parser/                 # normalizer, classifier, generic-parser, confidence, providers, samples
  transactions/           # model, selectors, repository binding
  insights/               # health score, categories, tips (pure)
  settings/  export/  onboarding/
database/ schema | migrations | repositories | client
services/ sms/ (SmsSource, ManualSmsSource)  export/  storage/
ai/ interfaces | schemas | prompts           # abstraction only, OFF, not wired to a provider
# (no i18n/ — UI is English-only as of the 2026-09-11 design revision)
types/  constants/  utils/  tests/  docs/
```

---

## 3. Tech choices (verified against current Expo SDK before install)

- Expo + Expo Router + TypeScript (init fresh — working dir is empty of an app).
- `expo-sqlite` (persistence) · `expo-font` + `@expo-google-fonts/plus-jakarta-sans`.
- `lucide-react-native` + `react-native-svg` (icons + confidence rings) — both Expo Go compatible.
- **Zustand** for app state (recommended over Context: the prototype is one big reactive store;
  Zustand maps to it cleanly). Zod for `ParseResult`/`Transaction` validation. Jest (`jest-expo`).
- ESLint + Prettier. No AI SDK wired in Stage 1 (interface only, setting OFF).

> Where a package isn't Expo Go-safe, it doesn't ship in Stage 1. I'll confirm each before adding.

---

## 4. Design-system translation (Violet → React Native)

Tokens are now inlined in the canvas (no `_ds/` link). Port them into `theme/`:

- **Colors**: accent violet `#8a4fd8` (ramp 100–900, `#f8f1ff` → `#33165a`), accent-2 lime
  `#6aad39` (`#f2fbe7` → `#233d12`), bg `#f7f6fc`, surface `#ffffff`, text `#16151c`,
  divider `rgba(32,30,43,.09)`, neutrals `#ffffff` → `#201e2b`.
- **Type**: **Plus Jakarta Sans** only — headings at weight **800**, body regular.
  One Google font family replaces the old Caprasimo + Figtree pairing.
- **Radius**: sm 12 / md 20 / lg 30. **Space**: 4 / 8 / 12 / 18 / 26 / 36 (clean integers now).
- **Shadows**: violet-tinted — `0 2px 10px rgba(74,64,110,.06)`, `0 10px 28px rgba(74,64,110,.11)`,
  `0 20px 52px rgba(74,64,110,.18)`.
- **Icons**: Lucide.
- Positive (in) = **lime** ramp; negative (out) = **violet** ramp — as the prototype tints rows.
- Keep 3:1 contrast minimum; use deep ramp steps for body text on accent fills.

---

## 5. Parser engine — ported, then tested

Port these from the design script into `features/parser/` as typed, pure modules:

1. **Normalizer** — CRLF→LF, unicode-space collapse, trim lines, drop blanks; original preserved.
2. **Classifier** — keyword rules → 12 categories with `reasons[]` and confidence; TZS/ref boosts.
3. **Generic parser** — regex extraction of amount(+currency), balance, reference, counterparty
   (`from`/`kwa`/`to`/ATM), phone/account mask, date (dd/mm/yy → `12 Mar 2026`) + time; provider
   hints (`wallet-a`/M-Pesa-like, `wallet-b`/Airtel-like, bank, promo).
4. **Confidence** — weighted factor sum (provider .16, type .16, amount .20, ref .14, party .12,
   date .10, balance .08) × classifier confidence; caps for OTP/promo; bands 0.95/0.80/0.60.
5. **Samples** — the 4 anonymized DEMO messages, clearly labeled, as fixtures + Lab buttons.
6. **Zod schema** for `ParseResult`; `mk()` field objects carry per-field `conf`/`low`/`missing`.

Provider parsers stay **DEMO** maturity until real anonymized fixtures validate them — no
fabricated live formats, no "supported" claims without passing tests.

---

## 6. Data layer

SQLite tables: `messages`, `transactions`, `parse_results`, `providers`, `processing_events`,
`settings`. Repositories: `Transaction`, `Message`, `ParseResult`, `Settings`. Seed = the 6 demo
transactions + provider rows, all flagged demo so "Remove demo data" can purge them (keeps records
whose id is user-created). Health/insights/categories/totals/filters are **selectors**, not tables.

---

## 7. Strings

The UI is **English-only** as of the 2026-09-11 design revision — the earlier `Swahili · English`
labels are gone, so **no i18n layer ships in Stage 1**. Strings live beside their components.

Two things survive from the Swahili era and must not be dropped:

- **SMS content is still Swahili.** Sample `s2` is a Swahili message (`Umetuma TZS 45,000 kwa …
Salio … Ada …`), and the classifier matches Swahili keywords (`umepokea`, `umetuma`, `umetoa`,
  `umeweka`, `umelipa`, `salio`, `muamala`, `muda wa maongezi`, `bando`, `bonasi`, `bofya`).
  These are **parser inputs**, not UI copy — they stay exactly as they are.
- **Two leftover Swahili strings in the canvas**: `weight: 'uzito '` (the score-factor weight
  prefix, visible as "uzito 40%") and `'Hakuna kiasi'` (the no-amount result label). I will ship
  these as **"weight "** and **"No amount"** unless you want them kept — flagged in §12.

TZS formatting stays `toLocaleString('en-US')`; dates render `12 Mar 2026` from `dd/mm/yy`.
---

## 8. Testing (Jest / jest-expo) — behavior locked to the ported engine

- **Normalizer**: whitespace, newlines, unicode, currency, original-preserved.
- **Classifier**: received, sent, withdrawal, OTP, promotional, unknown, TZS/ref boosts.
- **Generic parser**: amount, currency, reference, counterparty, phone/account mask, date.
- **Confidence**: band thresholds, OTP/promo caps.
- **Fixtures**: the 4 DEMO samples + missing-amount / missing-ref / unexpected-format / duplicate /
  unknown cases → assert exact category, fields, warnings, confidence band.
- **Selectors**: health score math (savings .4 / verified .25 / low-cash .2 / traceable .15), band
  thresholds 80/60/40; category aggregation; CSV escaping.
- No real customer SMS anywhere.

---

## 9. Build phases (implement in order, verify after each)

- **1A Foundation** — Expo + Router + TS init; `theme/` tokens + fonts; ESLint/Prettier; write the
  4 docs (`ARCHITECTURE`, `ROADMAP`, `PRIVACY`, `PARSER_ENGINE`); shared UI primitives (Button,
  Card, Tag, Field, Ring, Screen). Verify: runs in Expo Go.
- **1B Parser core** — port normalizer/classifier/generic-parser/confidence/samples + Zod +
  **unit tests first** (this is the riskiest logic; lock it early).
- **1C Data layer** — SQLite client, schema, migrations, repositories, demo seed; `ManualSmsSource`.
- **1D Onboarding** — welcome, how-it-works, privacy (non-legal), senders picker, setup.
- **1E Parser Lab + Result** — paste/samples/analyze pipeline; result card; per-field edit;
  "How we got this"; Save → transaction.
- **1F Dashboard** — health ring, factor bars, In/Out/Net, category toggle, tips, provider summary,
  recent, review count, demo banner + remove.
- **1G Transactions + Detail** — search/filters/date groups/masking; detail + Confirm/Edit/
  Incorrect/Delete + source-intact panel.
- **1H Review** — progress ring/streak; inline type chips + low-field inputs; Confirm/Ignore.
- **1I Settings + Export + Privacy** — grouped settings/toggles/actions; CSV+JSON export with
  preview; delete-all / clear-history; replay onboarding.
- **1J Hardening** — error/empty/loading states everywhere; accessibility labels/contrast/targets;
  full test pass; typecheck; lint; `.env.example`; logical commits.

---

## 10. Privacy & security (non-negotiable, from the design's own copy)

Local-first: paste → local parse → local DB. No cloud by default, AI OFF by default, no auto
SMS interception, **never log full messages**, mask phone/account, deletion + export are
user-initiated only. No secrets committed. No legal-compliance / Play-approval claims — the
prototype's own privacy screen says it "is not a legal, compliance or app-store approval statement."

---

## 11. Decisions — LOCKED (confirmed 2026-09-11)

1. **Scope = full design.** Health score, insights and tips **ship in the first build** (phase 1F).
   No fast-follow, no degraded dashboard.
2. **Health-score weights are the shipped formula**, exactly as the prototype defines them:
   savings **0.40** · verified records **0.25** · low cash-out **0.20** · traceable **0.15**;
   bands at **80 / 60 / 40** (Nzuri sana · Nzuri · Wastani · Hatarini). Tests assert these exact
   values, and they live in one constants module so retuning later is a one-line change.
3. **App identity**: `tz.svl.pesaiq` — accepted as the working format for now, not final.
4. **English-only UI** — the 2026-09-11 revision removed Swahili from the interface. No i18n layer.
5. **Zustand** for state; **Expo Router** file-based nav with a 5-tab bar (Home / Records / Lab /
   Review / Settings).
6. **Fresh Expo init** in `C:\Projects\PesaIQ` (no app project exists yet); `git init` so the
   suggested commit sequence applies.

## 12. Outstanding

- **Design revision received and reconciled (2026-09-11).** The folder was re-exported: the old
  theme is archived as `PesaIQ Android (Organic).dc.html`; `PesaIQ Android.dc.html` is now the
  source of truth. Changes: full re-theme (violet/lime, Plus Jakarta Sans) and an English-only UI.
  **The parser engine is byte-identical apart from display labels** — every regex, weight,
  threshold and sample is unchanged, so §5 and the health-score weights in §11 stand as written.
- **Two leftover Swahili strings** in the new canvas: `weight: 'uzito '` and `'Hakuna kiasi'`.
  Shipping as "weight " and "No amount" unless you say otherwise.
- **`_ds/` is now stale** — it still holds the Organic system the canvas no longer links. Keep it
  as an archive; `theme/` is built from the tokens inlined in the new canvas.
