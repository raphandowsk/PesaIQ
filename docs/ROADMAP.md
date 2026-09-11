# PesaIQ — Roadmap

## Stage 1 — Expo Go MVP

Paste a financial SMS, parse it, confirm or edit it, save it locally.
Must run in Expo Go. No native modules. No Android Studio.

| Phase | Scope | Status |
|---|---|---|
| **1A** | Foundation: Expo + Router + TS, theme tokens, fonts, UI primitives, lint/format/test, docs | **Done** — 2026-09-11 |
| **1B** | Parser core: normalizer, classifier, generic parser, confidence, samples, Zod — tests first | **Done** — 2026-09-11 |
| **1C** | Data layer: SQLite schema, migrations, repositories, demo seed, `ManualSmsSource`, Zustand store | **Done** — 2026-09-11 |
| **1D** | Onboarding: welcome, how it works, privacy, senders picker, setup | Next |
| **1E** | Parser Lab + Result: paste, samples, pipeline, per-field edit, "How we got this", save | |
| **1F** | Dashboard: health ring, factor bars, in/out/net, category toggle, tips, providers, recent | |
| **1G** | Records + Detail: search, filters, date groups, masking, confirm/edit/incorrect/delete | |
| **1H** | Review queue: progress ring, streak, type chips, low-field inputs, confirm/ignore | |
| **1I** | Settings + Export + Privacy: toggles, actions, CSV/JSON export, delete-all | |
| **1J** | Hardening: empty/loading/error states, accessibility, full test pass, typecheck, lint | |

### Definition of done

App launches in Expo Go · onboarding works · dashboard works · demo data works ·
Parser Lab works · normalization, classification, generic parsing and confidence
scoring work · transactions persist, can be edited, reviewed and deleted · data
exports · settings work · tests pass · no secrets committed · docs exist ·
TypeScript clean · ESLint clean.

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
