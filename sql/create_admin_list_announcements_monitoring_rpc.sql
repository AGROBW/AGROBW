drop function if exists public.admin_list_announcements_monitoring();

create or replace function public.admin_list_announcements_monitoring()
returns table (
  id uuid,
  title text,
  description text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  views bigint,
  price numeric,
  images text[],
  category_id uuid,
  category_slug text,
  user_id uuid,
  highlight_home boolean,
  highlight_home_until timestamptz,
  highlight_category boolean,
  highlight_category_until timestamptz,
  leads_count bigint,
  messages_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  select exists (
    select 1
    from public.users
    where users.id = v_actor_id
      and (
        users.is_admin = true
        or upper(coalesce(users.role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem listar anúncios do monitoramento.';
  end if;

  return query
  select
    a.id as id,
    a.title as title,
    a.description as description,
    a.status as status,
    a.created_at as created_at,
    a.expires_at as expires_at,
    coalesce(a.views, 0)::bigint as views,
    a.price as price,
    a.images as images,
    a.category_id as category_id,
    a.category_slug as category_slug,
    a.user_id as user_id,
    coalesce(a.highlight_home, false) as highlight_home,
    a.highlight_home_until as highlight_home_until,
    coalesce(a.highlight_category, false) as highlight_category,
    a.highlight_category_until as highlight_category_until,
    (
      select count(*) from public.leads leads
      where leads.announcement_id = a.id
    ) + (
      select count(*) from public.guest_announcement_contacts contacts
      where contacts.announcement_id = a.id
    ) as leads_count,
    (
      select count(*) from public.chats chats
      where chats.announcement_id = a.id
    ) + (
      select count(*) from public.guest_announcement_contacts contacts
      where contacts.announcement_id = a.id
    ) as messages_count
  from public.announcements a
  order by a.created_at desc;
end;
$$;

revoke all on function public.admin_list_announcements_monitoring() from public, anon, authenticated;
grant execute on function public.admin_list_announcements_monitoring() to authenticated;
