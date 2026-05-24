create or replace function public.admin_list_reported_announcements()
returns table (
  id uuid,
  title text,
  description text,
  category_slug text,
  price numeric,
  status text,
  created_at timestamptz,
  user_id uuid,
  owner_name text,
  owner_email text,
  images text[],
  community_reports_count integer,
  community_report_reasons jsonb,
  community_reported_to_review_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
begin
  select exists (
    select 1
    from public.users
    where id = v_actor_id
      and (
        is_admin = true
        or upper(coalesce(role, '')) = 'ADMIN'
      )
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'Acesso negado. Apenas administradores podem listar denuncias de anuncios.';
  end if;

  return query
  select
    a.id,
    a.title,
    a.description,
    a.category_slug,
    a.price,
    a.status,
    a.created_at,
    a.user_id,
    coalesce(nullif(trim(u.name), ''), 'Anunciante') as owner_name,
    nullif(trim(u.email), '') as owner_email,
    coalesce(a.images, array[]::text[]) as images,
    coalesce(a.community_reports_count, 0) as community_reports_count,
    coalesce(a.community_report_reasons, '[]'::jsonb) as community_report_reasons,
    a.community_reported_to_review_at
  from public.announcements a
  join public.users u
    on u.id = a.user_id
  where a.community_reported_to_review_at is not null
  order by a.community_reported_to_review_at desc, a.created_at desc;
end;
$$;

grant execute on function public.admin_list_reported_announcements() to authenticated;
