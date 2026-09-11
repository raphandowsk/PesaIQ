# PesaIQ — Claude Build Prompt (SMS Intelligence MVP, Stage 1)

> Paste everything below the line into Claude Code as your build instruction.
> It is self-contained: product vision, tech constraints, staged strategy,
> architecture, phase order, and a strict definition of done.

---

## ROLE

You are the **lead engineer** for **PesaIQ**, an Android-first SMS Intelligence
application. Build it to production quality using **Expo + React Native + TypeScript**.

Reference competitor for UX polish and category framing (do **not** copy code,
branding, or content): `https://play.google.com/store/apps/details?id=com.easyexpense`
PesaIQ is differentiated: it turns **financial SMS notifications** into structured
transactions, starting with the **Tanzanian** market.

## PRODUCT VISION

PesaIQ is an **intelligent financial transaction inbox** that converts SMS
notifications into structured financial records. It detects a financial SMS,
understands it, extracts structured data, and produces a reviewable transaction.

Providers we intend to support **eventually** (Tanzania first):
M-Pesa, Airtel Money, Mixx by Yas, CRDB, NMB, NBC, Absa, Stanbic, plus generic
bank/payment SMS.

**Important honesty constraint:** We do **not** know the exact live SMS formats of
these providers. Build a flexible parser architecture and use **clearly marked,
anonymized sample messages** for development. Never fabricate real provider formats
and never claim a provider is "supported" without passing tests proving it.

## CRITICAL STAGED STRATEGY

**Stage 1 — Expo Go compatible MVP (build this now).**
Do **NOT** implement native SMS interception. Build the full experience around a
**pasted-SMS** flow: paste → normalize → classify → parse → validate → confidence →
show result → user confirms/edits → save locally → dashboard updates. Must run in
**Expo Go** with no native modules and no Android Studio requirement.

**Stage 2 — Expo Development Build (do NOT build now).**
Later this adds native Android SMS (SMS APIs, BroadcastReceiver, custom native
module, Expo Dev Build, EAS Build). **Architect Stage 1 so Stage 2 slots in without
a rewrite** — but do not implement or fake any native piece.

## TECHNOLOGY (prefer official Expo packages; no unnecessary deps)

- Expo (verify SDK compatibility before adding ANY package)
- React Native + TypeScript
- Expo Router (file-based navigation)
- Material-inspired, modern fintech UI
- SQLite for local persistence (Expo-compatible: `expo-sqlite`)
- Zustand **or** React Context for lightweight state
- Zod for runtime validation
- Jest (jest-expo preset) for tests
- ESLint + Prettier

## FIRST ACTIONS — INSPECT BEFORE WRITING

1. Inspect the repository; determine if empty or an existing app.
2. Inspect `package.json`, Expo SDK version, existing config.
3. Determine whether Expo Router and TypeScript are already configured.
4. **Do not overwrite an existing project blindly.** If empty, initialize the
   appropriate Expo project (TypeScript + Expo Router).
5. Before writing feature code, create the docs:
   `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/PRIVACY.md`, `docs/PARSER_ENGINE.md`.
6. Then produce a short implementation plan, and implement **Phase 1A only**, verify
   it runs, then proceed sequentially. Test after each major milestone.

## PROJECT STRUCTURE (adjust if a better architecture is justified; do not over-engineer)

```
app/
  _layout.tsx
  index.tsx
  (onboarding)/ welcome.tsx  privacy.tsx  setup.tsx
  (tabs)/ _layout.tsx  dashboard.tsx  transactions.tsx  parser-lab.tsx  settings.tsx
  transactions/[id].tsx
  review/index.tsx
components/ ui/  transactions/  dashboard/  parser/
features/ transactions/  messages/  parser/  providers/  settings/
database/ schema/  repositories/  migrations/
parser/ core/  providers/  rules/  classifiers/  normalizer/  confidence/
ai/ interfaces/  schemas/  prompts/  providers/
services/ storage/  export/  notifications/
types/   constants/   utils/   tests/   docs/
```

## CORE USER JOURNEY (Stage 1)

Open App → Onboarding → Dashboard → Parser Lab → Paste SMS → Analyze → Normalize →
Classify → Parse → Validate → Confidence Score → Show Result → Confirm/Edit →
Save Transaction → Dashboard updates.

## FEATURE SPEC

### Onboarding
Polished, modern financial aesthetic. Screens:
- **Welcome:** "Turn SMS notifications into organized financial records."
- **How it works:** SMS → Understand → Extract → Organize.
- **Privacy:** Stage 1 processes user-pasted messages; future versions may process
  incoming SMS on Android; financial data is sensitive; process locally where
  possible; cloud/AI is optional; user controls stored data. Do **NOT** make
  unsupported legal-compliance or Google Play approval claims.
- **Setup complete → Dashboard.**

### Dashboard
Total received, total sent, transaction count, needs-review count, recent
transactions, provider summary, quick action "Analyze SMS". Works with **seeded demo
data** initially, with a clear way to disable/remove demo data.

### Parser Lab (most important Stage 1 screen)
Multiline input + "Analyze Message" + example buttons (M-Pesa / Airtel / Bank /
Unknown), all **clearly marked as demo/anonymized**. Never use real customer data.

### Normalization
```ts
interface NormalizedSms { originalText: string; normalizedText: string; sender?: string; receivedAt?: string; }
```
Handle whitespace, newlines, unicode whitespace, currency formatting, case, common
date-format differences, multipart-like content. **Never destroy the original.**

### Classifier (explainable)
Categories: `PAYMENT_RECEIVED, PAYMENT_SENT, WITHDRAWAL, DEPOSIT, BANK_TRANSFER,
AIRTIME_PURCHASE, BILL_PAYMENT, BALANCE_UPDATE, OTP, PROMOTIONAL, SECURITY_ALERT, OTHER`.
```ts
interface ClassificationResult { category: MessageCategory; confidence: number; reasons: string[]; }
```
Must produce human-readable `reasons` (e.g. "Incoming-payment wording", "TZS amount").

### Parser engine (pluggable)
```ts
interface SmsParser { id: string; supports(m: NormalizedSms): boolean; parse(m: NormalizedSms): ParseResult; }
```
Parsers: `GenericParser, MpesaParser, AirtelMoneyParser, MixxByYasParser, CrdbParser,
NmbParser, GenericBankParser`. Provider parsers start as **DEMO/placeholder rules,
clearly labeled**. Do not fabricate real formats.

### ParseResult (validate with Zod)
```ts
interface ParseResult {
  category: MessageCategory; provider?: string; amount?: number; currency?: string;
  senderName?: string; recipientName?: string; accountOrPhone?: string;
  transactionReference?: string; balanceAfter?: number; transactionDate?: string;
  confidence: number; parserId: string; warnings: string[];
}
```

### Confidence engine
Bands: ≥0.95 Very High · 0.80–0.94 High · 0.60–0.79 Medium · <0.60 Needs Review.
Factors: provider recognition, type recognition, amount/currency/sender/recipient/
reference/date extraction, pattern consistency. Never treat low-confidence data as verified.

### Transaction model + statuses
```ts
interface Transaction {
  id: string; type: TransactionType; provider?: string; amount?: number; currency?: string;
  senderName?: string; recipientName?: string; maskedAccountOrPhone?: string;
  transactionReference?: string; balanceAfter?: number; transactionDate?: string;
  sourceMessageId?: string; confidence: number; status: TransactionStatus;
  createdAt: string; updatedAt: string;
}
```
Types: `RECEIVED, SENT, WITHDRAWAL, DEPOSIT, TRANSFER, AIRTIME, BILL_PAYMENT, UNKNOWN`.
Statuses: `PARSED, CONFIRMED, NEEDS_REVIEW, IGNORED, FAILED`.

### Local database (SQLite via repositories, never raw SQL in UI)
Tables: `messages, transactions, parse_results, providers, processing_events, settings`.
Flow: messages → parse_results → transactions. Repositories:
`TransactionRepository, MessageRepository, ParseResultRepository, SettingsRepository`.
Include a migrations mechanism.

### Transaction list & detail
List: search + filters (provider, type, date, needs-review). Cards mask sensitive
identifiers. Detail: full fields + confidence + status; actions Edit / Confirm /
Mark Incorrect / Delete. If AI-generated, clearly indicate it.

### Review queue
"Needs Review" screen; user corrects type/amount/provider/sender/recipient/reference/
date; on save status → `CONFIRMED` and a correction event is recorded.

### AI architecture (fallback only; OFF by default)
```ts
interface AiMessageParser { parse(m: NormalizedSms): Promise<AiParseResult>; }
```
Flow: known parser → if confidence ≥ threshold save; else AI fallback → validate
structured output (Zod) → confidence → save/review. Do **not** connect a real AI
provider unless necessary; do not send sensitive data externally by default. Setting
"AI Processing" defaults **OFF**.

### Privacy (local-first)
User → pasted SMS → local parser → local DB. No cloud upload by default; no analytics
containing SMS content; never log complete SMS; never expose full phone/account
numbers unnecessarily. Provide data-deletion functionality.

### Settings
Sections: Processing / Privacy / AI Processing / Providers / Data Management / About.
Processing toggles (Automatic processing OFF, AI fallback OFF, Cloud sync OFF).
Privacy actions: delete all transactions, delete all messages, clear processing
history, export my data.

### Data export
CSV and JSON. CSV header: `Date,Type,Provider,Amount,Currency,Sender,Reference,Confidence`.
Safe escaping. Only on explicit user action.

### Provider system
```ts
interface SmsProvider { id: string; name: string; country: string; enabled: boolean; }
```
Seed the providers listed above. Mark parser maturity `DEMO | EXPERIMENTAL | SUPPORTED`;
all start at `DEMO` until anonymized fixtures validate them.

### Demo data
Generator for sample received/sent/withdrawal/transfer records, clearly distinguished
from real user data, plus a "Clear Demo Data" action.

## CROSS-CUTTING REQUIREMENTS

- **Error handling:** gracefully handle empty/very long/unknown SMS, missing or
  invalid amount, missing provider, invalid date, invalid AI response, DB errors,
  parse errors. Never crash on unexpected formats.
- **Accessibility:** appropriate font sizes, screen-reader labels, contrast, touch
  targets, keyboard handling, understandable error messages.
- **UI quality:** clean, minimal, professional, mobile-first; strong typography and
  spacing; clear positive/negative transaction states; excellent empty/loading/error
  states. Must not look like a generic developer demo.
- **Future native abstraction (Stage 1 uses ManualSmsSource):**
  ```ts
  interface SmsSource { start(): Promise<void>; stop(): Promise<void>; }
  ```
  Implement `ManualSmsSource` (pasted messages) now; leave `AndroidSmsSource` for
  Stage 2 (do not fake it).

## TESTING (Jest / jest-expo)
Unit-test: normalizer (whitespace, newlines, unicode, currency); classifier (received,
sent, withdrawal, OTP, promotional, unknown); generic parser (amount, currency,
reference, sender, date). Provider fixtures use **anonymized demo messages only**;
cover successful payment, failed payment, missing amount, missing reference,
unexpected formatting, duplicate message, unknown message. Do not claim provider
support without passing tests.

## SECURITY RULES (hard constraints)
Never hard-code API keys or secrets; never auto-upload SMS; never log complete SMS;
never use real customer SMS in tests; never claim unsupported provider compatibility,
Google Play approval, or regulatory compliance without verification. Provide
`.env.example`; commit no secrets.

## GIT DISCIPLINE (if git available)
Logical commits, e.g.: `chore: initialize expo application`, `feat: add onboarding
flow`, `feat: add dashboard`, `feat: add parser lab`, `feat: add sms normalization`,
`feat: add message classifier`, `feat: add parser engine`, `feat: add transaction
database`, `feat: add transaction screens`, `feat: add review workflow`, `feat: add
export`, `test: add parser test suite`, `docs: add architecture documentation`.

## IMPLEMENTATION ORDER (follow exactly)
- **1A Foundation:** Expo, TS, Expo Router, UI foundation, docs, ESLint, Prettier.
- **1B Onboarding:** welcome, how-it-works, privacy, setup.
- **1C Dashboard:** summary cards, recent transactions, demo data.
- **1D Parser Lab:** input, demo messages, analyze, result display.
- **1E Parser engine:** normalizer, classifier, generic parser, confidence.
- **1F Database:** SQLite, repositories, transactions, messages, parse results.
- **1G Transaction UI:** list, detail, search, filters, review.
- **1H Privacy/data:** delete, export, settings.
- **1I Testing:** unit tests, parser fixtures, DB tests where practical.

## DEFINITION OF DONE (Stage 1)
App launches in Expo Go; onboarding, dashboard, demo data, Parser Lab, normalization,
classification, generic parsing, confidence, local persistence, edit, review, delete,
export, and settings all work; tests pass; no secrets committed; docs exist;
TypeScript has no unresolved errors; ESLint has no unresolved errors.

## FINAL REPORT (produce verbatim in this shape; do not fabricate results)
```
SMS INTELLIGENCE MVP — STAGE 1
Project:  Expo SDK:  React Native:  TypeScript:
BUILD ✓/✗   TYPE CHECK ✓/✗   LINT ✓/✗   TESTS ✓/✗
IMPLEMENTED - ...
NOT IMPLEMENTED - ...
KNOWN LIMITATIONS - ...
SECURITY NOTES - ...
NEXT STEP - ...
FILES CREATED - ...
FILES MODIFIED - ...
```
Do not say a check passed unless you actually ran it. Do not fabricate test results.

## START NOW
Inspect the repository first. Do not write the whole app at once. Determine project
state, produce the plan and the four architecture docs, implement **Phase 1A only**,
verify it runs in Expo Go, then continue sequentially, testing after each milestone.
Do not implement native Android SMS interception. Do not require Android Studio.
Immediate goal: a polished Expo Go app where I can paste a Tanzanian financial SMS,
analyze it, see the extracted transaction, confirm/edit it, and save it locally.
