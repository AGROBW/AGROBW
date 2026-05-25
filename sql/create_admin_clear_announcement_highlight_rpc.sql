create or replace function public.admin_clear_announcement_highlight(
  p_announcement_id uuid,
  p_highlight_type text
)
returns table (
  announcement_id uuid,
  highlight_home boolean,
  highlight_home_until timestamptz,
  highlight_category boolean,
  highlight_category_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_announcement public.announcements%rowtype;
begin
  if p_highlight_type not in ('home', 'category') then
    raise exception 'Tipo de destaque inválido: %. Use "home" ou "category".', p_highlight_type;
  end if;

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
    raise exception 'Acesso negado. Apenas administradores podem encerrar destaques.';
  end if;

  select *
  into v_announcement
  from public.announcements
  where id = p_announcement_id
  limit 1;

  if v_announcement.id is null then
    raise exception 'Anúncio não encontrado.';
  end if;

  if p_highlight_type = 'home' and not coalesce(v_announcement.highlight_home, false) then
    raise exception 'Este anúncio não possui destaque Home ativo.';
  end if;

  if p_highlight_type = 'category' and not coalesce(v_announcement.highlight_category, false) then
    raise exception 'Este anúncio não possui destaque Categoria ativo.';
  end if;

  update public.announcements
  set
    highlight_home = case when p_highlight_type = 'home' then false else highlight_home end,
    highlight_home_until = case when p_highlight_type = 'home' then null else highlight_home_until end,
    highlight_category = case when p_highlight_type = 'category' then false else highlight_category end,
    highlight_category_until = case when p_highlight_type = 'category' then null else highlight_category_until end,
    updated_at = now()
  where id = p_announcement_id
  returning *
  into v_announcement;

  return query
  select
    v_announcement.id,
    coalesce(v_announcement.highlight_home, false),
    v_announcement.highlight_home_until,
    coalesce(v_announcement.highlight_category, false),
    v_announcement.highlight_category_until;
end;
$$;

grant execute on function public.admin_clear_announcement_highlight(uuid, text) to authenticated;
