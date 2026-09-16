-- Delete account (Settings -> Account), which both app stores require of apps
-- with sign-up.
--
-- Deletes the caller's own account. Every table that holds account data
-- references auth.users with "on delete cascade", so the profile, account key,
-- PIN guard, signed-in phones, synced records and preferences, AI usage and
-- bulk-import row all go with it, in the same statement. Supabase Auth's own
-- sessions and identities for the account go too.
--
-- Access tokens already issued stay valid until they expire (within the hour),
-- but they can no longer reach any row, and they cannot be renewed.

create function public.delete_account()
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
  delete from auth.users u where u.id = uid;
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
