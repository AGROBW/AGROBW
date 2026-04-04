create or replace function public.admin_list_newsletter_subscriptions(
  p_search text default null,
  p_status text default null,
  p_page integer default 0,
  p_page_size integer default 20
)
returns table (
  id uuid,
  email text,
  source text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
    raise exception 'Acesso negado';
  end if;

  return query
  with filtered as (
    select ns.*
    from public.newsletter_subscriptions ns
    where (p_status is null or ns.status = p_status)
      and (
        p_search is null
        or trim(p_search) = ''
        or ns.email ilike '%' || trim(p_search) || '%'
      )
  )
  select
    filtered.id,
    filtered.email,
    filtered.source,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset v_offset
  limit v_limit;
end;
$$;

grant execute on function public.admin_list_newsletter_subscriptions(text, text, integer, integer) to authenticated;

create or replace function public.admin_export_newsletter_subscriptions(
  p_search text default null,
  p_status text default null
)
returns table (
  email text,
  source text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    ns.email,
    ns.source,
    ns.status,
    ns.created_at,
    ns.updated_at
  from public.newsletter_subscriptions ns
  where (p_status is null or ns.status = p_status)
    and (
      p_search is null
      or trim(p_search) = ''
      or ns.email ilike '%' || trim(p_search) || '%'
    )
  order by ns.created_at desc;
end;
$$;

grant execute on function public.admin_export_newsletter_subscriptions(text, text) to authenticated;
