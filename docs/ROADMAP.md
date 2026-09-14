# PesaIQ — Roadmap

## Stage 1 — Expo Go MVP

Paste a financial SMS, parse it, confirm or edit it, save it locally.
Must run in Expo Go. No native modules. No Android Studio.

| Phase  | Scope                                                                                                                                                                            | Status                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| **1A** | Foundation: Expo + Router + TS, theme tokens, fonts, UI primitives, lint/format/test, docs                                                                                       | **Done** — 2026-09-11 |
| **1B** | Parser core: normalizer, classifier, generic parser, confidence, samples, Zod — tests first                                                                                      | **Done** — 2026-09-11 |
| **1C** | Data layer: SQLite schema, migrations, repositories, demo seed, `ManualSmsSource`, Zustand store                                                                                 | **Done** — 2026-09-11 |
| **1D** | Onboarding: welcome, how it works, privacy, senders picker, setup                                                                                                                | **Done** — 2026-09-11 |
| **1E** | Parser Lab + Result: paste, samples, pipeline, per-field edit, "How we got this", save                                                                                           | **Done** — 2026-09-11 |
| **1F** | Dashboard: health ring, factor bars, in/out/net, category toggle, tips, providers, recent                                                                                        | **Done** — 2026-09-11 |
| **1G** | Records + Detail: search, filters, date groups, masking, confirm/edit/incorrect/delete                                                                                           | **Done** — 2026-09-12 |
| **1H** | Review queue: progress ring, streak, type chips, low-field inputs, confirm/ignore                                                                                                | **Done** — 2026-09-12 |
| **1I** | Settings + Export + Privacy: toggles, actions, CSV/JSON export, delete-all                                                                                                       | **Done** — 2026-09-12 |
| **1J** | Hardening: empty/loading/error states, accessibility, full test pass, typecheck, lint                                                                                            | **Done** — 2026-09-12 |
| **1K** | Fees, taxes and categories: real Mixx and LUKU layouts, fee and tax lines, categories remembered per recipient, Fees & taxes screen                                              | **Done** — 2026-09-12 |
| **1L** | Reports: monthly summary for a month or a custom range, compared with the period before, saved as a PDF, with agent/operator fees; Home score info window and one-at-a-time tips | **Done** — 2026-09-12 |

### Definition of done

App launches in Expo Go · onboarding works · dashboard works · demo data works ·
Parser Lab works · normalization, classification, generic parsing and confidence
scoring work · transactions persist, can be edited, reviewed and deleted · data
exports · settings work · tests pass · no secrets committed · docs exist ·
TypeScript clean · ESLint clean.

### Stage 1 against the definition of done

Checked 2026-09-12, at the end of 1J; the Reports row and test counts added at the end of 1L.

| Item                                                       | Status                                                         | How it was checked                                                                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App launches in Expo Go                                    | **Not yet confirmed on a phone**                               | The Android bundle exports cleanly (`expo export --platform android`) and the same app runs in the web preview. Opening it in Expo Go on a device is the remaining check. |
| Onboarding                                                 | Works                                                          | Web preview walkthrough; onboarding suite                                                                                                                                 |
| Dashboard                                                  | Works                                                          | Web preview; insights suite                                                                                                                                               |
| Demo data                                                  | Works                                                          | Seed and removal suites; web preview                                                                                                                                      |
| Parser Lab                                                 | Works                                                          | Web preview; Lab suite                                                                                                                                                    |
| Normalization, classification, generic parsing, confidence | Works                                                          | Parser suites, the robustness suite (27 hostile inputs, 500 generated), and anonymized real Mixx and LUKU layouts                                                         |
| Local persistence                                          | Works                                                          | Database and store suites against real SQLite                                                                                                                             |
| Edit, review, delete                                       | Works                                                          | Record, review and data-management suites; web preview                                                                                                                    |
| Export                                                     | Works on web; Android folder picker covered by unit tests only | Export and save suites; web preview                                                                                                                                       |
| Settings                                                   | Works                                                          | Web preview; store suites                                                                                                                                                 |
| Tests pass                                                 | 49 suites, 802 tests                                           | `npm test`                                                                                                                                                                |
| No secrets committed                                       | None found                                                     | Scan of tracked files for key and token patterns                                                                                                                          |
| Docs exist                                                 | Yes                                                            | README and `docs/`                                                                                                                                                        |
| TypeScript clean                                           | Yes                                                            | `npm run typecheck`                                                                                                                                                       |
| ESLint clean                                               | Yes, zero warnings                                             | `npm run lint`                                                                                                                                                            |

## Stage 2 — Expo Development Build

**Not started. Do not begin without explicit instruction.**

Adds native Android SMS: `AndroidSmsSource` behind the existing `SmsSource`
interface, a BroadcastReceiver, a custom native module, EAS Build. Requires
sensitive SMS permissions and their Play Store review. Everything downstream of
`SmsSource` is already built and should not need rewriting.

## Beyond

Real provider fixtures (promoting parsers DEMO → EXPERIMENTAL → SUPPORTED),
optional AI fallback for low-confidence messages, budgets and caps hinted at by the
dashboard tips, multi-currency.
