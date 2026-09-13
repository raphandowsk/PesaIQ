-- The signed-in phones list looks phones up by account.
-- (Supabase performance advisor: unindexed foreign key devices_user_id_fkey.)
create index devices_user_id on public.devices (user_id);
