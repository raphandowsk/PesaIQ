# PesaIQ — Parser engine

Status: **implemented and tested.** The general rules below date from Phase 1B
(2026-09-11). Since 2026-09-14 the **Tanzania mobile-money parser** reads
M-Pesa, Airtel Money, Mixx by Yas, HaloPesa and T-PESA messages first (see
"Tanzania mobile money" at the end). The general rules read everything it does
not recognize: banks, LUKU receipts and the demo samples. AI reading is paused
(`features/ai/config.ts`).

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
  6+ alphanumerics. Missing → warning that only the exact same message is caught
  as a repeat.
- **Counterparty** — `from X` (0.90) · `kwa X` (0.88) · `paid/umelipa/to X` (0.76) ·
  literal `ATM withdrawal` (0.62).
- **Account / phone** — `0XXXXXXXXX` → `07** *** 678`; `****NNNN` → `**** NNNN`.
  **Identifiers are always masked.**
- **Date** — `dd/mm/yy` → `12 Mar 2026`, plus `HH:MM` if present. The first _real_
  date wins: one that cannot exist (31/02, month 13, a three-digit year) is skipped,
  as is an impossible time (25:61). A four-digit year is taken as written. No real
  date → a warning that capture time will be used instead.
- **Provider** — sender/text hints: the demo senders wallet-a (M-Pesa-like) and
  wallet-b (Airtel-like), bank (crdb/nmb/nbc/absa/stanbic/acct), promo
  (unrecognized). A real operator is the Tanzania parser's to recognize, never a
  single word here.

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

The five mobile-money operators are **EXPERIMENTAL** (since 2026-09-14): their
rules come from documented layouts and, for Mixx, the owner's own messages.
The banks stay **DEMO**. Nothing is **SUPPORTED**: that needs anonymized
fixtures from real phones. The sample messages are invented.

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
- **Duplicates are skipped by the store, not the parser.** The reference and
  provider make the transaction ID; see "Duplicates" in `ARCHITECTURE.md`.

## Real Mixx and LUKU layouts (2026-09-12)

Built from messages the user supplied. Every name and number in the fixtures
(`tests/fixtures/tz-messages.ts`) is invented; the fee and VAT figures are kept,
because they are tariff amounts and the arithmetic checks rely on them.

| Layout                                     | Signature                                                     | What is read                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Mixx "Umetuma kikamilifu ... kwenda kwa"   | "Jumla ya makato", "Risiti", "Kila Muamala ni Bao la Ushindi" | amount; recipient network, name and Lipa or phone number; total charges; VAT; balance; "Namba ya muamala"; receipt; date |
| Mixx "Umetuma ... kwenda kwa mpokeaji wa"  | "Mixx" in the footer                                          | the same, with the fee as "Ada"                                                                                          |
| Mixx "Malipo yamekamilika kwenda X, Kiasi" | "Kumbukumbu no."                                              | payee, amount, fee, VAT, reference                                                                                       |
| LUKU receipt                               | "...KWH" and an itemised "TOTAL"                              | total, units, meter (masked), token, price before tax, VAT, EWURA and REA with their rates, debt collected, reference    |

Mixx is now **EXPERIMENTAL**. The LUKU receipt's sender is left unrecognized
until a message shows which wallet sent it.

### Fees and taxes (`charges.ts`)

- **Fee:** "Jumla ya makato", "Ada", "Ada ya kutoa" (a withdrawal), or "Fee",
  "Charges", "Transaction cost".
- **Taxes:** VAT, excise duty, government levy ("tozo"), EWURA and REA, each with
  its rate when stated, and where it sits: inside the fee, inside the amount, or
  on top of both.
- **Checks:** a fee's VAT must be 18% of it. In every sample it is already inside
  (fee × 18/118: 450 → 69, 495 → 76, 1,440 → 220); VAT on top (fee × 18%) is
  also recognised. A receipt's lines must add up to its total, and each tax must
  match its rate. A mismatch becomes a warning and flags the taxes for review.

### Categories (`moneyCategory.ts`)

`inferMoneyCategory` picks one of 13 spending and income categories from:

- the type
- the counterparty: HELABET → Betting; TOTALENERGIES or "service station" → Fuel
  & transport; LUKU, TANESCO or DAWASA → Electricity & water
- whether the recipient is a merchant: a Lipa number with no other clue → Food &
  shopping

A category the user picks is remembered for that recipient (`partyKey`: case,
spacing and punctuation ignored) and applied to the next message.

### Masking

Numbers written as 255... are masked like local ones (`07** *** 123`). Lipa,
till and meter numbers keep their last four digits. The LUKU token is kept on
the record and shown only on request. It never appears in the parse fields (only
its last four digits do), in the masked source-message view, or in an export.

## Tanzania mobile money (2026-09-14)

Built to the owner's _Tanzania Mobile Money SMS Specification_ (v1.0), in
`features/parser/tz/`. Deterministic and offline: plain TypeScript, no network,
no AI, no clock, no logging. Parser version **1.0.0**, recorded on every reading
(`details.parserVersion`) so an old record stays auditable.

### Architecture

```
SmsMessage → normalize → each operator with evidence for itself parses → most confident wins
                                                                          ↓
                                              below 0.50, or no kind → UNKNOWN (kept for review)
                                                                          ↓
                                                     tzResult.ts → ParseResult (the app's shape)
```

`parseNormalized` (`engine.ts`) calls `parseTanzaniaSms` first. When no operator
has any evidence for itself it returns null, and the general rules above read
the message, so banks, LUKU receipts and the demo samples behave as before.

| File                                            | Holds                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `index.ts`                                      | The master parser (§37), `PARSER_VERSION`, `toUnknownSms` (§43)              |
| `normalize.ts`                                  | Whitespace, dashes and invisible characters; case and line breaks kept       |
| `classifier.ts`                                 | Operator evidence (§28), direction, status, the 16 kinds in §29's order      |
| `confidence.ts`                                 | §45's weights, §53's consistency penalty, the 0.98 ceiling                   |
| `amount.ts`, `phone.ts`, `date.ts`              | §24, §25 (normalized, then masked), and the four date forms                  |
| `transaction-id.ts`                             | §26's labels, most specific first, plus M-Pesa's leading code                |
| `patterns/*.patterns.ts`                        | Every regex, per operator, plus the shared vocabulary (§23, §38)             |
| `operators/*.ts`                                | One parser per operator (§36), from `createOperatorParser(patterns, hooks)`  |
| `types/{operator,transaction,parser-result}.ts` | Operator codes and sender-ID hints (§27), `ParsedTransaction` (§4, §35)      |
| `../tzResult.ts`                                | A reading as a `ParseResult`: fields, fee and tax lines, categories, details |

### Which operator

Weighted signals, never one word (§2, §28): the sender ID exactly matching a
documented one (+0.50), the operator's own name in the message (+0.35), and each
documented phrase (+0.25, two at most), less 0.30 for each other operator with
any evidence. A network named as the other side of a transfer ("kwenda kwa
mpokeaji wa Halo Pesa", "Payment To TIPS-Mixx") does not count. The operator
counts as recognized from 0.50.

The layout "Umetuma pesa kwa NAME, kiasi Tsh …/=, Ada ----" is documented for
M-Pesa, Airtel Money, HaloPesa and T-PESA alike, so on its own it names none of
them: it needs a sender ID or the operator's name.

### What kind

REVERSAL, REFUND → BANK_TRANSFER (in or out) → GOVERNMENT_PAYMENT →
INTERNATIONAL_TRANSFER → MERCHANT_PAYMENT → BILL_PAYMENT → WITHDRAWAL →
DEPOSIT → AIRTIME, BUNDLE → RECEIVED → SENT → BALANCE_NOTIFICATION → UNKNOWN.
Every money kind needs its own words **and** an amount. A one-time code or a
promotion is UNKNOWN. "Failed" or "pending" wording is kept as the status.

In the app the 16 kinds map onto the 8 record types: a merchant payment is Sent
(to a merchant), a government payment is a Bill payment, money from a bank is
Received, money to a bank is a Transfer, a bundle is Airtime, a reversal or
refund follows its direction, and a failed or pending one moved no money. The
kind itself is kept (`details.kind`) and shown on the Result and record screens,
beside "Parsed from SMS" (§49): a reading is never called verified.

### Confidence

| Factor                        | Weight |
| ----------------------------- | ------ |
| Operator recognized           | 0.25   |
| Transaction type recognized   | 0.20   |
| Amount extracted              | 0.20   |
| Transaction ID extracted      | 0.15   |
| Sender or recipient extracted | 0.10   |
| Balance extracted             | 0.05   |
| Date extracted                | 0.025  |
| Time extracted                | 0.025  |

Each field that does not add up (an impossible amount, a levy larger than its
fee) costs 0.10. The ceiling is 0.98, as in §40's example. Below **0.50** the
message is UNKNOWN: in the app it has no type and scores under the review line.

### Regex patterns

Shared fragments: currency `(?:TZS|Tshs?|TSH)\.?`; number
`(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`; a transaction ID is
`[A-Z0-9][A-Z0-9._-]{5,40}` containing a digit.

- **M-Pesa** (`mpesa.patterns.ts`): code `([A-Z0-9]{6,20})\s+[Ii]methibitishwa`;
  balance `salio\s+lako\s+la\s+M[-\s]?PESA\s+ni …`; receipt
  `Transaction\s+Amount\s*:?\s*NUM\s*TZS`, `Total\s+fees?\s*:?\s*NUM\s*TZS`,
  `Receipt\s+Number …`, `Bill\s+Reference …`, `Payment\s+Type …`; merchant
  `merchant\s+payment\s+to\s*(\d{4,10}\s*-\s*LIPA … NAME)`; a bank (NMB and
  others) with transfer wording.
- **Airtel Money** (`airtel.patterns.ts`): `txn\s*id\s*[:-]?\s*(ID)`;
  `umepokea\s*NUM\s*Tshs?`; `kutoka\s*\(\s*jina\s+la\s+akaunti\s*:\s*(NAME)\)`;
  `salio\s+lako\s+ni\s*NUM\s*Tshs?`; "Kwenda Kwa No" and "Jina La Mpokeaji".
- **Mixx by Yas** (`mixx.patterns.ts`, `recipient.ts`): "Jumla ya makato",
  "Salio jipya ni", "Namba ya muamala", "Malipo yamekamilika kwenda NAME, Kiasi",
  `kwenda kwa (mpokeaji wa)? NETWORK (LIPA)? NAME - number`, "Risiti"; a GePG
  control number and payment ID.
- **HaloPesa** (`halopesa.patterns.ts`): `utambulisho\s+wa\s+muamala\s*:\s*(ID)`;
  `umetuma\s+TSH\s*NUM`; "kwenda NETWORK, jina NAME"; `gharama\s+TSH\s*NUM`;
  `tozo\s+(?:ya|la)\s+serikali … NUM` (a government levy, kept as a tax inside
  the fee); `wakati\s+yyyy/mm/dd hh:mm:ss`; `salio\s+lako\s+jipya\s+ni …`.
- **T-PESA** (`tpesa.patterns.ts`): the shared layout, reported as
  `TPESA_PATTERN_CONFIRMED_PUBLIC_EXAMPLE`, with a caution that T-PESA is known
  from one public example.

### Tests

`tests/tz-fixtures.test.ts` runs every fixture in `tests/fixtures/tz/` (at least
ten per operator, 54 in all). It checks each reading field by field, that it
says parsed and never verified, and that no field holds a full phone number.
`tests/tz-parser.test.ts` covers each part (amounts, phones, dates, IDs, operator
evidence, the kind order, confidence, the master parser, §46's security rules)
and how readings appear in the app. `tests/tz-formats.test.ts` still pins the
owner's Mixx and LUKU layouts.

Every name and number in the fixtures is invented. The specification's own
examples were re-filled, and a test checks that none of its real names or
numbers appear. Each fixture says where its layout comes from (§56): **A** a
documented Tanzanian example, **B** a public example still to check, **LOCAL**
the owner's own messages, **ASSUMED** written only to exercise a rule.

### Known limitations

- **Nothing is checked against real phones yet.** Apart from the owner's Mixx
  messages, every layout comes from the specification's public examples, and
  some fixtures are assumed. The operators are EXPERIMENTAL, not SUPPORTED.
- **T-PESA** is known from one example, in a layout shared with three other
  operators: it needs its sender ID or its name.
- **Dates are day-first.** A month-first date is misread.
- **Balance consistency** (§53, "balance changed consistently") needs the
  previous balance, which a single pasted message does not carry.
- **Unknown messages** are kept only when saved: the unattended path
  (`analyzeAndSave`) stores them for review, and in the Lab the person chooses
  "Save it anyway". The bulk import must leave out one-time codes (§46): the
  parser marks them, but the store does not yet refuse them.

### Adding a template

1. Anonymize a real message: replace every name, number, code and balance.
2. Add it as a fixture in `tests/fixtures/tz/<operator>.ts` with the reading you
   expect, and `evidence` set honestly. Run `npx jest tz-fixtures`: it fails.
3. Add the layout's patterns to `patterns/<operator>.patterns.ts`: a `marker`
   for wording only this operator uses, a `template` naming the layout, and any
   amount, fee, balance, ID or party pattern the shared vocabulary misses.
   Operator patterns are tried before the shared ones.
4. Run the whole suite. Every other fixture must still pass.
5. Raise `PARSER_VERSION` in `operators/base.ts`: 1.1.0 for new or changed
   patterns, 2.0.0 for a change to how readings are built.
