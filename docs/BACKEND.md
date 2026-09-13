# PesaIQ — Backend (Supabase)

Status, 2026-09-13: the test project exists and has the first schema. The app
is not connected yet: there is no sign-up or sync code.

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
reaches. Service-role or secret keys and Twilio credentials never go into the
repository or the app.

## Dashboard steps for the project owner

These involve secrets or account settings, so the owner does them in the
Supabase and Twilio dashboards.

1. **Phone sign-in:** in Authentication, enable the Phone provider and choose
   Twilio. Enter the Twilio Account SID, Auth Token and Messaging Service SID.
2. **Test number:** on the same page, add a test phone number with a fixed code,
   for development and for store reviewers.
3. **Email sign-up off:** PesaIQ signs people up by mobile number only.
4. **Rate limits:** cap the number of SMS codes sent per hour.
5. **SMS text:** short and clear, for example "Your PesaIQ code is {{ .Code }}".
6. **Twilio:** allow sending to Tanzania only at first, and turn on its SMS
   fraud protection.
