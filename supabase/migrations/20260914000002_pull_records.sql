-- Pulling records for sync, in pages that never skip a row.
--
-- A phone asks for the rows changed after the last one it saw, ordered by the
-- server's update time and then by id. Rows sent in one request share one
-- update time, so the id breaks the tie and a page can safely end among them.
-- security invoker: row-level security still limits a phone to its own rows.

create function public.pull_records(
  p_after timestamptz,
  p_after_id uuid,
  p_limit integer default 500
)
returns setof public.records
language sql
stable
security invoker
set search_path = ''
as $$
  select *
    from public.records r
   where r.user_id = (select auth.uid())
     and (r.updated_at, r.id) > (p_after, p_after_id)
   order by r.updated_at, r.id
   limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke execute on function public.pull_records(timestamptz, uuid, integer) from public, anon;
grant execute on function public.pull_records(timestamptz, uuid, integer) to authenticated;

-- The pull's order as an index. It replaces the one on (user_id, updated_at).
create index records_user_updated_at_id on public.records (user_id, updated_at, id);
drop index public.records_user_updated_at;
