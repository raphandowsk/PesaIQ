-- A daily cap on AI reading, per account, so a runaway phone or a misuse of
-- the parse-sms function can't run up the Anthropic bill. The function counts
-- the messages it is about to send, through ai_take(), before it sends them.

create table public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages integer not null default 0,
  primary key (user_id, day)
);

-- Row-level security on and no policies: only ai_take() touches it.
alter table public.ai_usage enable row level security;

create function public.ai_take(p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  daily_limit constant integer := 500;
  today date := (now() at time zone 'utc')::date;
  used integer;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then
    return jsonb_build_object('allowed', false, 'used', 0, 'limit', daily_limit);
  end if;

  insert into public.ai_usage (user_id, day) values (uid, today) on conflict do nothing;
  select u.messages into used from public.ai_usage u
   where u.user_id = uid and u.day = today for update;

  if used + p_count > daily_limit then
    return jsonb_build_object('allowed', false, 'used', used, 'limit', daily_limit);
  end if;
  update public.ai_usage u set messages = used + p_count
   where u.user_id = uid and u.day = today;
  return jsonb_build_object('allowed', true, 'used', used + p_count, 'limit', daily_limit);
end;
$$;

revoke execute on function public.ai_take(integer) from public, anon;
grant execute on function public.ai_take(integer) to authenticated;
