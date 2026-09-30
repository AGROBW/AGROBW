begin;

do $$
begin
  if to_regclass('public.announcements') is null
     or to_regclass('public.leads') is null
     or to_regclass('public.chats') is null
     or to_regclass('public.guest_announcement_contacts') is null then
    raise exception 'ADMIN_ANNOUNCEMENT_MONITORING_CONTACT_PREREQUISITES_MISSING';
  end if;
end;
$$;

create index if not exists guest_announcement_contacts_announcement_idx
  on public.guest_announcement_contacts (announcement_id);

drop function if exists public.admin_list_announcements_monitoring();

create function public.admin_list_announcements_monitoring()
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
    announcements.id,
    announcements.title,
    announcements.description,
    announcements.status,
    announcements.created_at,
    announcements.expires_at,
    coalesce(announcements.views, 0)::bigint,
    announcements.price,
    announcements.images,
    announcements.category_id,
    announcements.category_slug,
    announcements.user_id,
    coalesce(announcements.highlight_home, false),
    announcements.highlight_home_until,
    coalesce(announcements.highlight_category, false),
    announcements.highlight_category_until,
    (
      select count(*) from public.leads leads
      where leads.announcement_id = announcements.id
    ) + (
      select count(*) from public.guest_announcement_contacts contacts
      where contacts.announcement_id = announcements.id
    ),
    (
      select count(*) from public.chats chats
      where chats.announcement_id = announcements.id
    ) + (
      select count(*) from public.guest_announcement_contacts contacts
      where contacts.announcement_id = announcements.id
    )
  from public.announcements announcements
  order by announcements.created_at desc;
end;
$$;

revoke all on function public.admin_list_announcements_monitoring()
  from public, anon, authenticated;
grant execute on function public.admin_list_announcements_monitoring()
  to authenticated;

commit;
