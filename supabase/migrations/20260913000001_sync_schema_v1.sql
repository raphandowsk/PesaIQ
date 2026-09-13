-- PesaIQ sync schema, v1.
--
-- Accounts are Supabase Auth users who signed up with a mobile number; the
-- number itself lives in auth.users. Everything describing a person's money is
-- encrypted on their phone before it is sent: this database holds locked
-- records it cannot read, plus the little it needs to route them.
--
-- Row-level security is on for every table: an account reaches only its own
-- rows. The anon role gets nothing.

-- Profile: the only plain-text personal detail besides the number.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The account's record key, locked on the phone with a key derived from the
-- user's PIN (and, if they kept one, a second copy locked with a recovery key).
-- The server never sees the PIN, the recovery key or the record key.
create table public.account_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  wrapped_key text not null check (char_length(wrapped_key) <= 512),
  wrap_nonce text not null check (char_length(wrap_nonce) <= 64),
  kdf text not null check (kdf in ('argon2id', 'scrypt')),
  kdf_salt text not null check (char_length(kdf_salt) <= 128),
  kdf_params jsonb not null,
  recovery_wrapped_key text check (char_length(recovery_wrapped_key) <= 512),
  recovery_nonce text check (char_length(recovery_nonce) <= 64),
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Phones signed in to the account, for the "signed-in phones" list.
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label text check (char_length(label) <= 60),
  platform text check (platform in ('android', 'ios', 'web')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One row per record. Amount, type, provider, names, category, fees and taxes
-- are all inside the ciphertext. Original SMS messages are never sent.
create table public.records (
  -- Made on the phone, so the same record has the same id on every phone.
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- HMAC of the transaction ID under the record key: lets two phones skip the
  -- same transaction without telling the server what it is.
  dedupe_key text check (char_length(dedupe_key) <= 128),
  ciphertext text not null check (char_length(ciphertext) <= 65536),
  nonce text not null check (char_length(nonce) <= 64),
  key_version integer not null default 1,
  -- A deletion is kept as a tombstone so it reaches the other phones.
  deleted boolean not null default false,
  -- When the user made the change, on their phone: the latest edit wins.
  edited_at timestamptz not null,
  -- When the server accepted it: phones pull everything after their last pull.
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index records_user_dedupe_key
  on public.records (user_id, dedupe_key)
  where dedupe_key is not null and not deleted;
create index records_user_updated_at on public.records (user_id, updated_at);

-- Remembered categories and settings, as one encrypted document per account
-- (the categories hold recipient names).
create table public.synced_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) <= 262144),
  nonce text not null check (char_length(nonce) <= 64),
  key_version integer not null default 1,
  edited_at timestamptz not null,
  updated_at timestamptz not null default now()
);

-- updated_at is always the server's clock.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- The latest edit wins: an older edit arriving late leaves the row unchanged.
create function public.keep_latest_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.edited_at < old.edited_at then
    return old;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger account_keys_touch before update on public.account_keys
  for each row execute function public.touch_updated_at();
create trigger records_latest before update on public.records
  for each row execute function public.keep_latest_edit();
create trigger synced_settings_latest before update on public.synced_settings
  for each row execute function public.keep_latest_edit();

-- A profile row for every new account.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger functions are not API endpoints.
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.keep_latest_edit() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Row-level security: each account reaches only its own rows.
alter table public.profiles enable row level security;
alter table public.account_keys enable row level security;
alter table public.devices enable row level security;
alter table public.records enable row level security;
alter table public.synced_settings enable row level security;

create policy "Own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "Own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Own key: read" on public.account_keys
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own key: create" on public.account_keys
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Own key: update" on public.account_keys
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Own devices: read" on public.devices
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own devices: add" on public.devices
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Own devices: update" on public.devices
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own devices: remove" on public.devices
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "Own records: read" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own records: add" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Own records: update" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "Own settings: read" on public.synced_settings
  for select to authenticated using (user_id = (select auth.uid()));
create policy "Own settings: create" on public.synced_settings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Own settings: update" on public.synced_settings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
