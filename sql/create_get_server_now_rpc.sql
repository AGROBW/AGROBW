drop function if exists public.get_server_now();

create or replace function public.get_server_now()
returns table (
  server_now timestamptz
)
language sql
security definer
set search_path = public
as $$
  select now() as server_now;
$$;

grant execute on function public.get_server_now() to authenticated, anon, service_role;
