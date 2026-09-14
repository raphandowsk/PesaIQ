-- The one bulk import each account gets (decided 2026-09-14): up to 90 days of
-- past messages, pasted at once. After that, messages are added one at a time.
--
-- Kept on the server so it holds across phones and reinstalls. The row says
-- only when it was used: the messages themselves never leave the phone.

create table public.bulk_imports (
  user_id uuid primary key references auth.users (id) on delete cascade,
  used_at timestamptz not null default now()
);

-- An account can see its own row. Nobody can add, change or delete one except
-- through claim_bulk_import(), so it cannot be reset from the app.
alter table public.bulk_imports enable row level security;

create policy "Own import: read" on public.bulk_imports
  for select to authenticated using (user_id = (select auth.uid()));

-- Claims the import. `claimed` is true the first time; after that it is false,
-- with the time it was used.
create function public.claim_bulk_import()
returns table (claimed boolean, used_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  claimed_at timestamptz;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  insert into public.bulk_imports (user_id) values (uid)
    on conflict (user_id) do nothing
    returning bulk_imports.used_at into claimed_at;

  if claimed_at is not null then
    return query select true, claimed_at;
  else
    return query select false, b.used_at from public.bulk_imports b where b.user_id = uid;
  end if;
end;
$$;

revoke execute on function public.claim_bulk_import() from public, anon;
grant execute on function public.claim_bulk_import() to authenticated;
