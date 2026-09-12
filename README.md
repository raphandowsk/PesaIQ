# PesaIQ

An Android-first app that turns the money SMS people in Tanzania already receive
(mobile money and bank alerts) into structured, private, on-device records.

**Stage 1** runs in **Expo Go**. Paste a message and PesaIQ normalizes, classifies
and parses it, scores its confidence, and lets you confirm or correct it. Then it
saves it on the device. There is no native SMS reading, no account and no server.

## What Stage 1 does

- **Parser Lab:** paste an SMS, watch the pipeline run, see every extracted field
  with its confidence and "How we got this", correct anything, save.
- **Home:** a financial health score built from your own records, what builds it,
  spending and income by category, tips, recent records, providers.
- **Records:** search, filter by type, provider and period, grouped by day. Each
  record opens to its detail and source message (identifiers masked), where you can
  confirm, edit, send back to review or delete it.
- **Review:** records the parser was unsure about, with the uncertain fields ready
  to correct. Confirm or ignore each one.
- **Settings and Export:** delete all transactions, messages or processing history;
  export saved records as CSV or JSON to a folder you pick.

- **Fees, taxes and categories:** each record keeps its fee and every tax line
  (VAT, EWURA, REA, levies), and what the money was for. Home shows fees and
  taxes apart from spending, with a breakdown by type and provider. A category
  you pick is remembered for that recipient.

Mixx by Yas rules are **experimental**, built from real message layouts. The
other provider parsers are **demo rules**, checked only against invented, anonymized
sample messages. PesaIQ makes no claim of support for any real provider's
messages, of app-store approval, or of regulatory compliance.

## Privacy

Everything stays on the device. Messages are processed only when you paste them,
full messages are never logged, account and phone numbers are masked, AI and cloud
sync are off (and not implemented in Stage 1), and export happens only when you tap
it. See [docs/PRIVACY.md](docs/PRIVACY.md).

## Running it

Requirements: Node.js **22.5 or later** (the tests use the built-in `node:sqlite`),
npm, and the **Expo Go** app (SDK 57) on an Android phone.

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. The phone and computer must be on the same network.

There is also a web preview for quick checks in a browser (`npm run web`). It keeps
its database in the browser, which allows **one tab at a time**.

No environment variables are needed for Stage 1. [.env.example](.env.example) lists
placeholders for later stages; never commit a real `.env`.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run format:check
```

Tests run against a real SQLite engine (Node's built-in one), not a mock, and use
invented sample messages only.

## Layout

| Path                                                    | What lives there                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `app/`                                                  | Screens, by route (Expo Router): onboarding, the five tabs, Result, Detail, Export |
| `features/parser/`                                      | Normalizer, classifier, extractors, confidence, provider hints, samples            |
| `features/transactions/`                                | Record model, the app store, Records filtering, editing rules                      |
| `features/insights/`                                    | Health score, categories, tips, streak (pure functions)                            |
| `features/review/`, `features/export/`, `features/lab/` | Review queue, export formats, the Lab's draft                                      |
| `database/`                                             | SQLite schema, migrations, repositories, demo seed                                 |
| `services/`                                             | The SMS source (`ManualSmsSource`) and saving exports                              |
| `components/`, `theme/`                                 | UI building blocks and the design tokens                                           |
| `tests/`                                                | Jest suites                                                                        |
| `docs/`                                                 | Architecture, parser engine, privacy, roadmap                                      |

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Progress and the
Stage 1 definition of done are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Not in Stage 1

Reading SMS automatically needs native Android code, sensitive SMS permissions and
their Play Store review. That is Stage 2, and it is not started. Nothing in this
build requests SMS access.
