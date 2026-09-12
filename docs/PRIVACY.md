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

- **No cloud by default.** Cloud sync is off and unimplemented.
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
  for each. They stay on the device and are deleted with "Delete all
  transactions". Settings → Remembered categories → **Forget** clears them on
  their own.
- Phone numbers written as 255... are masked like local ones.
