# PesaIQ — Backend (Supabase)

Status, 2026-09-14: the app signs in with a mobile number against the test
project, and syncs encrypted records while Cloud sync is on (see "Sync").

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
| `20260914000001_pin_guard.sql`          | The PIN's guess limit: `pin_guard` and its three functions |
| `20260914000002_pull_records.sql`       | `pull_records` for sync, and its index                     |

What each table lets the server see:

| Table             | Holds                                                                                          | Readable by the server                   |
| ----------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `auth.users`      | The account, with its mobile number                                                            | The number                               |
| `profiles`        | An optional display name                                                                       | The name, if given                       |
| `account_keys`    | The account key, locked with a key made from the PIN and the server's secret (no recovery key) | Nothing usable: never the PIN or the key |
| `pin_guard`       | The PIN's guess count, any wait, and a verifier (an HMAC under the account key)                | The count; the verifier reveals nothing  |
| `devices`         | Signed-in phones: label, platform, last seen                                                   | Those three                              |
| `records`         | One locked record each, its fingerprint for duplicates, edit time, deletion marker             | Only ids, times and fingerprints         |
| `synced_settings` | Settings and remembered categories, locked as one document                                     | Nothing                                  |

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

## Checks run on the test project (2026-09-14)

- **PIN guess limit, live and rolled back** (one throwaway account):
  - Setting the first PIN counted nothing.
  - Once the key existed, the 5th guess was allowed and started the 1-minute
    wait; a 6th was refused.
  - A wrong verifier was refused; the right one reset the count.
  - `pin_reset` deleted the key.
- **`pin-oprf` without signing in:** `401`.
- **Security advisor**, all expected:
  - `pin_guard` has row-level security with no policies (INFO). This is
    intended: only its functions touch it.
  - Signed-in users can call the three `security definer` functions (WARN).
    This is intended: each is limited to the caller's own row.
  - Leaked-password protection is off (WARN). PesaIQ has no passwords, so it
    doesn't apply.
- **`pull_records`, live and rolled back** (throwaway accounts):
  - Seven rows sent in one statement shared one update time.
  - Pages of 3 returned all seven, each once, in 3 pages.
  - Another account saw none of them; a signed-out caller was refused.
  - Security and performance advisors: nothing new.

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

| Secret                    | What it is                                       | Status                  |
| ------------------------- | ------------------------------------------------ | ----------------------- |
| `MESSAGING_SERVICE_TOKEN` | The provider's API token                         | Set 2026-09-13          |
| `SEND_SMS_HOOK_SECRET`    | `v1,whsec_…`, made when the hook is turned on    | Set 2026-09-13          |
| `MESSAGING_SERVICE_MODE`  | `live` to send real SMS                          | `live` since 2026-09-14 |
| `PIN_OPRF_SECRET`         | 32+ random characters for `pin-oprf` (see below) | Not yet                 |

## The PIN: the `pin-oprf` function

Deployed to `pesaiq-test` on 2026-09-14 (`supabase/functions/pin-oprf/`), with
JWT checks on: only a signed-in person can call it.

- **What it does:**
  1. Counts the guess first (`pin_attempt`, called with the caller's own
     sign-in).
  2. Only if the guess is allowed, multiplies the blinded PIN point by the
     caller's key.
- **The caller's key** is derived from `PIN_OPRF_SECRET` and the account id,
  and is never stored. Without that secret, a copy of the database cannot test
  PINs.
- **Changing `PIN_OPRF_SECRET` makes every existing PIN stop working.** Set it
  once and keep it safe.
- **Limit:** 5 tries, then waits of 1 minute, 5 minutes, 1 hour, then a day.
  Answers `429` with `retry_at` while a wait runs. Nothing is counted while an
  account is setting its first PIN.
- **The three database functions** run with raised rights (`security definer`),
  but each acts only on the caller's own row:
  - `pin_attempt`: counts a guess.
  - `pin_confirm`: records the verifier, or checks it and resets the count.
  - `pin_reset`: for "Forgot PIN?", deletes everything synced to the account.
- **Logs:** never a PIN, a point or a key.

## Sync

The app's side is `features/sync/` (see "Sync" in `ARCHITECTURE.md`). On the
server:

- **Pushing** is an upsert into `records` by id. The latest-edit trigger keeps
  a newer row; the fingerprint index refuses a second live row for one
  transaction (`23505`), and the phone then joins its copy to the existing row.
- **Pulling** is `pull_records(p_after, p_after_id, p_limit)`: rows after a
  position in (update time, id) order, at most 1,000 a call, only the caller's
  own (`security invoker`, so row-level security applies). The phone passes
  back the update time exactly as the server wrote it, microseconds included.
- **A deletion** is an upsert with `deleted = true`, no fingerprint, and a
  locked empty body.

Not built yet:

- Remembered categories and settings (`synced_settings`).
- The signed-in phones list (`devices`).
- Removing an account's records from the server when sync is turned off.
- A phone that missed a "Forgot PIN" still holds the old key: it must sign out
  and in again. Nothing tells it yet.

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
7. **PIN secret:** make 32 random bytes, for example with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   Save the result as the Edge Function secret `PIN_OPRF_SECRET`, and keep a
   copy somewhere safe. Never change it once people have PINs.
