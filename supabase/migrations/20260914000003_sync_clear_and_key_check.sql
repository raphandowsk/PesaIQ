-- Two things phones learn from the server.
--
-- 1. "Turn off and remove" (Settings -> Cloud sync): one phone deletes the
--    account's synced records and preferences, and dates it in
--    profiles.sync_cleared_at. The other phones see the new date on their
--    next sync and turn sync off too.
-- 2. Whether a phone's account key is still the account's. After "Forgot PIN"
--    on another phone it is not: the phone sends the verifier of its key (an
--    HMAC under the key, as pin_confirm does) and learns whether it matches.

alter table public.profiles add column sync_cleared_at timestamptz;

create function public.sync_clear()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cleared timestamptz := now();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.records r where r.user_id = uid;
  delete from public.synced_settings s where s.user_id = uid;
  insert into public.profiles (id, sync_cleared_at) values (uid, cleared)
    on conflict (id) do update set sync_cleared_at = excluded.sync_cleared_at;
  return cleared;
end;
$$;

-- Read-only: unlike pin_confirm, it never records a verifier or resets the count.
create function public.pin_key_is_current(p_verifier text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return exists (
    select 1
      from public.pin_guard g
      join public.account_keys k on k.user_id = g.user_id
     where g.user_id = uid and g.verifier = p_verifier
  );
end;
$$;

revoke execute on function public.sync_clear() from public, anon;
revoke execute on function public.pin_key_is_current(text) from public, anon;
grant execute on function public.sync_clear() to authenticated;
grant execute on function public.pin_key_is_current(text) to authenticated;
