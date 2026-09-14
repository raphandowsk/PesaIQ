-- The PIN and its guess limit.
--
-- A 4-digit PIN has 10,000 possibilities, so it is only safe if guesses are
-- counted where nobody but the server can reset the count. Every guess goes
-- through the pin-oprf Edge Function, which calls pin_attempt() first and only
-- then applies its secret to the (blinded) PIN. The secret never leaves the
-- function, so a copy of this database alone cannot be used to test PINs.
--
-- Policy: 5 tries, then waits of 1 minute, 5 minutes, 1 hour, then one try a
-- day. Never a permanent lock: there is no recovery key (decided 2026-09-14).

-- The account key can now be locked this way.
alter table public.account_keys drop constraint account_keys_kdf_check;
alter table public.account_keys add constraint account_keys_kdf_check
  check (kdf in ('argon2id', 'scrypt', 'oprf-ristretto255-v1'));

-- The guess count. Row-level security on and no policies: only the functions
-- below, which run as their owner, read or write it.
create table public.pin_guard (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failures integer not null default 0,
  locked_until timestamptz,
  -- HMAC of the account key: proves a correct PIN without revealing anything.
  verifier text check (char_length(verifier) <= 128),
  updated_at timestamptz not null default now()
);
alter table public.pin_guard enable row level security;

-- One guess. Refused while a wait is running. Before the account has a key
-- (setting the PIN for the first time) nothing is counted: there is nothing to
-- guess yet. Afterwards every guess counts until pin_confirm() resets it.
create function public.pin_attempt()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  guard public.pin_guard;
  wait interval;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.pin_guard (user_id) values (uid) on conflict (user_id) do nothing;
  select * into guard from public.pin_guard g where g.user_id = uid for update;

  if guard.locked_until is not null and guard.locked_until > now() then
    return jsonb_build_object(
      'allowed', false, 'retry_at', guard.locked_until, 'failures', guard.failures
    );
  end if;

  if not exists (select 1 from public.account_keys k where k.user_id = uid) then
    return jsonb_build_object('allowed', true, 'setup', true, 'failures', 0, 'user_id', uid);
  end if;

  guard.failures := guard.failures + 1;
  wait := case
    when guard.failures < 5 then null
    when guard.failures = 5 then interval '1 minute'
    when guard.failures = 6 then interval '5 minutes'
    when guard.failures = 7 then interval '1 hour'
    else interval '1 day'
  end;
  update public.pin_guard g
    set failures = guard.failures,
        locked_until = case when wait is null then null else now() + wait end,
        updated_at = now()
    where g.user_id = uid;

  return jsonb_build_object(
    'allowed', true, 'setup', false, 'failures', guard.failures, 'user_id', uid
  );
end;
$$;

-- A correct PIN: the phone opened the account key and sends its verifier.
-- The first confirm (right after the PIN is set) records the verifier; later
-- ones must match it, and reset the count.
create function public.pin_confirm(p_verifier text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  stored text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_verifier is null or char_length(p_verifier) = 0 or char_length(p_verifier) > 128 then
    return false;
  end if;

  select g.verifier into stored from public.pin_guard g where g.user_id = uid for update;
  if not found then
    insert into public.pin_guard (user_id, verifier) values (uid, p_verifier);
    return true;
  end if;
  if stored is null or stored = p_verifier then
    update public.pin_guard g
      set verifier = p_verifier, failures = 0, locked_until = null, updated_at = now()
      where g.user_id = uid;
    return true;
  end if;
  return false;
end;
$$;

-- A forgotten PIN: delete everything synced to the account, so a new PIN can
-- be set. Records on the phone are untouched (the app keeps them).
create function public.pin_reset()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.records r where r.user_id = uid;
  delete from public.synced_settings s where s.user_id = uid;
  delete from public.account_keys k where k.user_id = uid;
  delete from public.pin_guard g where g.user_id = uid;
end;
$$;

revoke execute on function public.pin_attempt() from public, anon;
revoke execute on function public.pin_confirm(text) from public, anon;
revoke execute on function public.pin_reset() from public, anon;
grant execute on function public.pin_attempt() to authenticated;
grant execute on function public.pin_confirm(text) to authenticated;
grant execute on function public.pin_reset() to authenticated;
