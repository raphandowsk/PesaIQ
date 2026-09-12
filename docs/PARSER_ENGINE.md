# PesaIQ — Parser engine

Status: **implemented and tested** (Phase 1B, 2026-09-11). 138 tests green.

## Provenance

The design canvas (`Android app design questions/PesaIQ Android.dc.html`) contains a
complete working engine. Phase 1B ports it into typed modules rather than
re-inventing it — it is the de-risked source of truth for Stage 1 behavior.

Verified 2026-09-11: the engine is **byte-identical between the Organic and violet
canvas revisions apart from display labels.** Every regex, weight and threshold below
is what the prototype actually runs.

## Pipeline

```
raw text → normalize → classify → extract → score → ParseResult
```

### 1. Normalize

CRLF → LF · unicode spaces (` `, ` - `, ` `, ` `, `　`)
→ plain space · collapse runs of 2+ spaces/tabs · trim each line · drop blank lines.

**The original text is never destroyed.** `ParseResult` carries both.

### 2. Classify

First match wins, in this order:

| Category           | Trigger                                                                                     | Base confidence |
| ------------------ | ------------------------------------------------------------------------------------------- | --------------- |
| `OTP`              | otp, one-time, do not share, usitoe, siri                                                   | 0.90            |
| `PROMOTIONAL`      | bonasi, bonus, offer, promo, karibu!, bofya, dial *, win — _and no TZS transaction wording_ | 0.72            |
| `PAYMENT_RECEIVED` | received, umepokea, imepokelewa, credited                                                   | 0.92            |
| `WITHDRAWAL`       | withdraw, withdrawal, umetoa, atm                                                           | 0.90            |
| `DEPOSIT`          | deposit, umeweka                                                                            | 0.88            |
| `AIRTIME_PURCHASE` | airtime, muda wa maongezi, bando                                                            | 0.84            |
| `BILL_PAYMENT`     | luku, bili, bill, umelipa, paid to                                                          | 0.84            |
| `PAYMENT_SENT`     | sent, umetuma, debited, transferred                                                         | 0.91            |
| `BALANCE_UPDATE`   | salio, balance                                                                              | 0.70            |
| `OTHER`            | nothing matched                                                                             | 0.40            |

Boosts: a `TZS` token adds +0.03 (capped 0.97); a reference-like token
(`ref`/`muamala`/`txnid`/`receipt`) adds a reason but no confidence.

Every classification returns `reasons[]` — the UI shows these verbatim.

> **Swahili keywords are load-bearing.** The UI is English, but messages are not.

### 3. Extract

- **Amount** — `TZS|TSH <number>` either order. Falls back to a bare 4–7 digit run at
  confidence 0.55 with a warning that currency was not stated. Missing → warning that
  the record cannot be verified.
- **Balance** — after `new balance` / `avail bal` / `salio`.
- **Reference** — after `ref` / `receipt` / `txnid` / `muamala` / `transaction id`,
  6+ alphanumerics. Missing → warning that duplicates cannot be detected.
- **Counterparty** — `from X` (0.90) · `kwa X` (0.88) · `paid/umelipa/to X` (0.76) ·
  literal `ATM withdrawal` (0.62).
- **Account / phone** — `0XXXXXXXXX` → `07** *** 678`; `****NNNN` → `**** NNNN`.
  **Identifiers are always masked.**
- **Date** — `dd/mm/yy` → `12 Mar 2026`, plus `HH:MM` if present. The first _real_
  date wins: one that cannot exist (31/02, month 13, a three-digit year) is skipped,
  as is an impossible time (25:61). A four-digit year is taken as written. No real
  date → a warning that capture time will be used instead.
- **Provider** — sender/text hints: wallet-a (M-Pesa-like), wallet-b (Airtel-like),
  bank (crdb/nmb/nbc/absa/stanbic/acct), promo (unrecognized).

### 4. Score

```
confidence = 0.24 + Σ(matched factor weights)
confidence = clamp(0.18, 0.98, confidence × (0.72 + classifierConfidence × 0.30))
```

| Factor                  | Weight |
| ----------------------- | ------ |
| Provider recognized     | 0.16   |
| Message type recognized | 0.16   |
| Amount + currency       | 0.20   |
| Reference extracted     | 0.14   |
| Counterparty extracted  | 0.12   |
| Date extracted          | 0.10   |
| Balance extracted       | 0.08   |

`PROMOTIONAL` and `OTP` are capped at 0.52 — a promo message must never look like a
confident transaction.

**Bands:** ≥0.95 Very high · ≥0.80 High · ≥0.60 Medium · below Needs review.

Per-field confidence is tracked separately; a field under 0.75 is flagged `low` and
is **never treated as verified**.

## Provider maturity

All provider parsers ship as **DEMO**. They are promoted to EXPERIMENTAL or SUPPORTED
only when anonymized fixtures prove them. No live provider format is claimed, and the
four sample messages are invented.

## Test plan (Phase 1B)

Normalizer (whitespace, unicode, original preserved) · classifier (each category,
boosts, promo/OTP caps) · extractors (amount, currency, reference, counterparty,
mask, date) · confidence bands · the 4 samples · missing-amount, missing-reference,
unexpected formatting, duplicate, unknown.

## Deviations from the canvas

The port is faithful except for two deliberate fixes, both covered by tests.

### 1. Counterparty verb matching is now case-insensitive

The canvas patterns match the leading verb in lower case only
(`/\b(?:paid|umelipa|to)\s+.../`). A real Swahili message opens with a capital —
"**U**melipa TZS 38,500 LUKU TOKEN" — so the counterparty was silently dropped.
The canvas hides this because its bill-payment record is hardcoded seed data that
never passes through the parser.

Fixed by allowing either case on the verb only (`[Uu]melipa`). The captured name
stays strictly upper-case: an `/i/` flag would start capturing ordinary prose,
since the all-caps convention is what identifies a name in the first place.

### 2. The non-transactional cap is applied after damping

The canvas caps promotional and OTP confidence at 0.52 **before** multiplying by
`(0.72 + classifierConfidence × 0.30)`. That multiplier reaches 1.02, so the cap
can be lifted back over its own ceiling — it holds today only because promotional
(max 0.75) and OTP (max 0.93) classifier confidences happen to stay below ~0.933.

Applying the cap after damping makes the ceiling hold by construction. On real
input the difference is at most 0.003 and never changes a band.

## Known limitations

- **Dates are read day-first** (`dd/mm/yy`). A US-style `mm/dd` message is
  misread. Acceptable for Tanzania; revisit if the market widens.
- **Confidence clamps at 0.98**, so a parse with six of seven factors scores the
  same as a perfect one. The band is identical either way, but the number does
  not distinguish them. This is the canvas formula, kept deliberately.
- **A bare number is assumed to be TZS.** Flagged low (0.55) with a warning, and
  never treated as verified.
- **No duplicate detection yet.** The reference is extracted for it; the check
  itself arrives with the repository in Phase 1C.
