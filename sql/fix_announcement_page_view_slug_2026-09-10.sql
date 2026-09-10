begin;

create or replace function public.record_site_page_view(
  p_session_id text,
  p_user_id uuid default null,
  p_page_path text default '/',
  p_page_type text default 'page',
  p_page_label text default null,
  p_entity_id uuid default null,
  p_entity_key text default null,
  p_referrer text default null,
  p_user_agent text default null,
  p_device_type text default null,
  p_is_admin_area boolean default false,
  p_user_city text default null,
  p_user_state text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := null;
  v_entity_id uuid := p_entity_id;
  v_entity_lookup_key text := nullif(trim(coalesce(p_entity_key, '')), '');
  v_entity_key text := left(v_entity_lookup_key, 160);
begin
  if coalesce(trim(p_session_id), '') = '' then
    return;
  end if;

  if p_user_id is not null and auth.uid() = p_user_id then
    v_user_id := p_user_id;
  end if;

  if p_page_type = 'announcement' and v_entity_id is null and v_entity_key is not null then
    select a.id
     into v_entity_id
      from public.announcements a
     where a.slug = v_entity_lookup_key
     limit 1;
  end if;

  insert into public.site_page_views (
    session_id,
    user_id,
    page_path,
    page_type,
    page_label,
    entity_id,
    entity_key,
    referrer,
    user_agent,
    device_type,
    is_admin_area,
    user_city,
    user_state
  )
  values (
    left(p_session_id, 160),
    v_user_id,
    left(coalesce(nullif(trim(p_page_path), ''), '/'), 300),
    left(coalesce(nullif(trim(p_page_type), ''), 'page'), 80),
    left(nullif(trim(coalesce(p_page_label, '')), ''), 160),
    v_entity_id,
    v_entity_key,
    left(nullif(trim(coalesce(p_referrer, '')), ''), 600),
    left(nullif(trim(coalesce(p_user_agent, '')), ''), 700),
    left(nullif(trim(coalesce(p_device_type, '')), ''), 60),
    coalesce(p_is_admin_area, false),
    left(nullif(trim(coalesce(p_user_city, '')), ''), 120),
    left(upper(nullif(trim(coalesce(p_user_state, '')), '')), 2)
  );
end;
$$;

revoke execute on function public.record_site_page_view(
  text, uuid, text, text, text, uuid, text, text, text, text, boolean, text, text
) from public;

grant execute on function public.record_site_page_view(
  text, uuid, text, text, text, uuid, text, text, text, text, boolean, text, text
) to anon, authenticated;

commit;
