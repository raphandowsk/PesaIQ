# PesaIQ — Backend (Supabase)

Status, 2026-09-14: the app signs in with a mobile number against the test
project. There is no sync code yet.

The backend holds accounts (a mobile number confirmed by SMS code) and the
records that sync between a user's phones. Records are end-to-end encrypted on
the phone; the server stores locked data it cannot read. Original SMS messages
never leave the phone.

## Projects

| Project       | Purpose                                 | Region              | Ref                    |
| ------------- | --------------------------------------- | ------------------- | ---------------------- |
| `pesaiq-test` | Development and testing; test data only | eu-west-1 (Ireland) | `livglqqqjcariusmgqsz` |
| `pesaiq-prod` | Not created yet                         | To be decided       | —                      |

- **Organisation:** SVL, on the Pro plan.
- **Cost:** Supabase quoted US$10 a month for the test project when it was
  created.
- **Production region:** to be decided with legal advice. Data held outside
  Tanzania falls under the Personal Data Protection Act's cross-border transfer
  rules, and Supabase has no African region.

## Schema

Migrations live in `supabase/migrations/` and apply in filename order. A file
already applied to a project is never edited; a change goes in a new file.

| Migration                               | What it does                                               |
| --------------------------------------- | ---------------------------------------------------------- |
| `20260913000001_sync_schema_v1.sql`     | Tables, triggers and row-level security (below)            |
| `20260913000002_devices_user_index.sql` | Index for looking up an account's phones (advisor finding) |

What each table lets the server see:

| Table             | Holds                                                                                      | Readable by the server                   |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `auth.users`      | The account, with its mobile number                                                        | The number                               |
| `profiles`        | An optional display name                                                                   | The name, if given                       |
| `account_keys`    | The record key, locked with a key made from the user's PIN (and optionally a recovery key) | Nothing usable: never the PIN or the key |
| `devices`         | Signed-in phones: label, platform, last seen                                               | Those three                              |
| `records`         | One locked record each, its fingerprint for duplicates, edit time, deletion marker         | Only ids, times and fingerprints         |
| `synced_settings` | Settings and remembered categories, locked as one document                                 | Nothing                                  |

Rules the database enforces:

- **Row-level security on every table.** Policies exist only for signed-in
  users and match `auth.uid()`; a signed-out visitor (`anon`) reaches nothing.
- **The latest edit wins.** Each row carries the phone's `edited_at`; an older
  edit arriving late leaves the row unchanged. `updated_at` is always the
  server's clock, so phones pull everything since their last pull.
- **One record per transaction.** A partial unique index on
  `(user_id, dedupe_key)` refuses a second record with the same fingerprint,
  ignoring deleted rows. The fingerprint is an HMAC of the transaction ID under
  the user's record key, so the server cannot tell what the transaction is.
- **A profile for every account**, made by a trigger on `auth.users`.
- **Deleting an account removes all its rows** (`on delete cascade`).

## Checks run on the test project (2026-09-13)

- **Security advisor:** no findings.
- **Performance advisor:**
  - An unindexed foreign key on `devices.user_id`: fixed by migration 2.
  - `records_user_updated_at` reported as unused: expected until sync runs.
  - Auth connection strategy: informational, for later.
- **Live check, rolled back:** two test accounts in one transaction that was
  then discarded.
  - Both got a profile.
  - Account A saw its one record; account B and a signed-out visitor saw none.
  - An older edit sent late left the newer one in place.
  - A second record with the same fingerprint was refused.

## App configuration

`.env` (never committed; see `.env.example`) holds
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The
publishable key is meant to ship in the app: row-level security decides what it
reaches. Service-role or secret keys, the SMS provider's token and the hook
secret never go into the repository or the app.

## Sending codes: the `send-sms` hook

Supabase makes each code. Its **Send SMS** hook passes the number and the code
to the `send-sms` Edge Function (`supabase/functions/send-sms/`), which sends
it through **messaging-service.co.tz** (Messaging Service API V2, Internet SMS).
Deployed to `pesaiq-test` on 2026-09-13.

- **Sender ID:** `MUST`, lent while PesaIQ's own sender ID is approved
  (applied for 2026-09-14). `NEXTSMS` was refused: not registered on the
  account.
- **Message:** "PesaIQ: your code is 123456. Don't share it with anyone."
- **Numbers:** Tanzanian mobiles only (`255`, then nine digits starting with 6
  or 7). The `+255` and `07…` forms are accepted.
- **Signature first:** every call is checked against the hook secret (Standard
  Webhooks) before anything is sent. That is why the function is deployed with
  JWT checks off.
- **Test mode by default:** the provider's free test endpoint answers with
  dummy data and sends nothing. Only `MESSAGING_SERVICE_MODE=live` sends real
  SMS.
- **Errors:** the person signing up is told what to do (try later, check the
  number, wait a while), never the provider's reason; the reason goes to the
  function's log.
- **Logs:** never the code, never a whole number (`255******111`).
- **Limits:** the provider accepts at most 20 messages per number per hour (6
  identical). Supabase's own SMS rate limit should sit below that.
- **Tests:** the rules above are in `logic.ts` and tested in
  `tests/send-sms.test.ts`.

Edge Function secrets, set by the owner:

| Secret                    | What it is                                    | Status            |
| ------------------------- | --------------------------------------------- | ----------------- |
| `MESSAGING_SERVICE_TOKEN` | The provider's API token                      | Set 2026-09-13    |
| `SEND_SMS_HOOK_SECRET`    | `v1,whsec_…`, made when the hook is turned on | Not yet           |
| `MESSAGING_SERVICE_MODE`  | `live` to send real SMS                       | Unset (test mode) |

## Dashboard steps for the project owner

These involve secrets or account settings, so the owner does them in the
Supabase dashboard.

1. **Phone sign-in:** Authentication → Sign In / Providers → Phone: enable it,
   and leave automatic phone confirmation off; with it on, no code is ever sent.
2. **Send SMS hook:** Authentication → Hooks → Send SMS, as an HTTPS hook to
   `https://livglqqqjcariusmgqsz.supabase.co/functions/v1/send-sms`. Save the
   secret it generates as the Edge Function secret `SEND_SMS_HOOK_SECRET`.
3. **Test number:** on the Phone page, add a test phone number with a fixed
   code, for development and for store reviewers.
4. **Email sign-up off:** PesaIQ signs people up by mobile number only.
5. **Rate limits:** cap the number of SMS codes sent per hour.
6. **Go live:** after a successful test, set `MESSAGING_SERVICE_MODE` to `live`.
