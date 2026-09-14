# PesaIQ — Privacy model

Last updated 2026-09-12.

> This document describes how the application behaves. **It is not a legal,
> compliance, or app-store approval statement**, and it does not claim any
> regulatory status.

## Stage 1 behavior

```
User → pasted message → local parser → local SQLite → local UI
```

Stage 1 processes **only messages the user pastes in**. Nothing is intercepted.
No SMS permission is requested, and no native SMS code exists in the build.

## Commitments

- **No cloud by default.** Cloud sync is off until the user turns it on, and
  then uploads encrypted records only (see "Cloud sync").
- **AI is off by default.** The `ai/` layer is an interface with no provider wired
  in. If it is ever enabled, only low-confidence messages would be sent, and only
  after explicit opt-in.
- **Full messages are never logged.** Diagnostics may record message _length_,
  category and confidence — never content.
- **Identifiers are masked** wherever displayed: `07** *** 678`, `**** 4312`.
- **No analytics containing message content.**
- **Export is user-initiated only.** Nothing is written without a tap. On Android
  the user picks the folder; on the web the browser saves the file. PesaIQ itself
  sends the file nowhere.
- **Exports carry what the app shows, no more.** Masked identifiers only, never
  source messages, and never the invented demo samples. Once saved, an export is
  outside PesaIQ: deleting data in the app does not delete a file already exported.
- **The user can delete everything** from Settings, each after an in-place
  confirmation: all transactions (their source messages go with them), all source
  messages (records are kept), and processing history.

## What is stored, and where

| Table               | Holds                        | Notes                                               |
| ------------------- | ---------------------------- | --------------------------------------------------- |
| `messages`          | Pasted source text           | Retained so a parse can be re-explained. Deletable. |
| `transactions`      | Structured records           | Masked identifiers only.                            |
| `parse_results`     | Extraction + confidence      | Explains how a record was derived.                  |
| `processing_events` | Parse and correction events  | No message content.                                 |
| `providers`         | Provider registry + maturity | No user data.                                       |
| `settings`          | Toggles                      | Local.                                              |

All of it lives in one on-device SQLite database. There is no server, no account,
and no network call in the Stage 1 data path.

## Source-message retention

Source text is kept deliberately: the "How we got this" view and the review queue
both need it, and re-parsing after a rule change requires it. It is the single most
sensitive thing stored, so it is masked in display, never logged, and removable via
**Settings → Delete all messages**.

## Stage 2 note

Stage 2 would add Android SMS reading, which requires `READ_SMS` / `RECEIVE_SMS` —
sensitive permissions with their own Play Store review. That is a future decision
with its own disclosure requirements; nothing here pre-approves it. The parsing and
storage model above would not change: still local, still no upload by default.

## Fees, taxes and categories (2026-09-12)

- **LUKU tokens** are kept on the record so they can be entered again. They are
  shown only after tapping **Show token**, are masked in the source-message view
  until "Show full numbers", and are never exported.
- **Remembered categories** store recipient names alongside the category chosen
  for each. They stay on the device unless Cloud sync is on (see below), and
  are deleted with "Delete all
  transactions". Settings → Remembered categories → **Forget** clears them on
  their own.
- Phone numbers written as 255... are masked like local ones.

## Reports (2026-09-12)

- **A report PDF is made only when Save PDF is tapped.** On Android the user
  picks the folder; on the web the browser's print window saves it. PesaIQ sends
  it nowhere.
- **The PDF carries totals and categories only:** no names, phone or account
  numbers, references, LUKU tokens or message text.
- Demo records in the period are flagged in the PDF. Once saved, a PDF is
  outside PesaIQ, like an export: deleting data in the app does not delete it.

## Accounts (2026-09-14)

- **PesaIQ now needs an account:** a mobile number confirmed by a code sent by
  SMS. The number is stored by Supabase Auth on the server (see
  `docs/BACKEND.md`). PesaIQ never stores or logs the code.
- **Messages stay on the phone. Records stay there too unless Cloud sync is
  turned on** (see "Cloud sync" below).
- **The sign-in session** is kept in the phone's secure storage. Signing out
  affects this phone only and keeps the records on it.
- **The in-app privacy wording** still describes the phone-only design, and must
  be updated before release (see the launch checklist).
- **The PIN never leaves the phone.** The server only sees a blinded value
  that reveals nothing about it, and it counts every guess: 5 tries, then
  waits. The account key it unlocks is stored on the server only in locked
  form. The unlocked key stays in this phone's secure storage and is removed
  on sign-out.
- **There is no recovery key.** A forgotten PIN means the records synced to the
  account are deleted from the server and a new PIN is set. The records on the
  phone are kept.
- **Signed-in phones:** each phone signed in and unlocked tells the server a
  name for itself (the Android maker and model, "iPhone", "iPad" or "Web
  browser"), its platform and when it was last active, so Settings can list
  the account's phones. Signing out removes the phone from the list.

## Cloud sync (2026-09-14)

- **Off until the user turns it on** in Settings. Turning it off asks whether
  to keep what was synced on the server or remove it. **Turn off and remove**
  deletes the account's synced records, categories and provider choices from
  the server, and turns sync off on the account's other phones when they next
  connect. Nothing is deleted from any phone.
- **A phone whose key was replaced** (a "Forgot PIN" on another phone) asks for
  the new PIN before it syncs again, so nothing it sends is locked with the
  old key.
- **Records are encrypted on the phone before they leave it**, with a key made
  from the account key (AES-256-GCM). The server stores locked rows it cannot
  read, plus each row's id, edit time, deletion marker and a duplicate
  fingerprint (an HMAC of the transaction ID that reveals nothing about it).
- **SMS messages are never uploaded**, encrypted or not. A record synced to
  another phone arrives without its message.
- **Demo samples are never uploaded.**
- **Remembered categories and provider choices sync too**, as one document
  encrypted the same way (the categories hold recipient names). Forgetting
  categories on one phone forgets them on the others. Cloud sync itself, demo
  data and onboarding stay each phone's own.
- **Deletions reach every phone.** A deleted record's row keeps no content.
- **One account per phone.** Records synced to one account are not uploaded to
  another; the second account can sync once they are deleted from the phone.
