create or replace function public.get_public_about_stats()
returns table (
  active_users bigint,
  created_ads bigint,
  generated_deals bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    (
      select count(*)
      from public.users u
      where coalesce(u.is_suspended, false) = false
    ) as active_users,
    (
      select count(*)
      from public.announcements a
    ) as created_ads,
    (
      select count(*)
      from public.leads l
    ) as generated_deals;
end;
$$;

revoke all on function public.get_public_about_stats() from public;
grant execute on function public.get_public_about_stats() to anon, authenticated;
