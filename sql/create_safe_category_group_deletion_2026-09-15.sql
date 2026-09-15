begin;

set local lock_timeout = '5s';

do $preconditions$
begin
  if to_regclass('public.category_groups') is null
    or to_regclass('public.categories') is null
    or to_regclass('public.category_group_categories') is null
    or to_regclass('public.announcements') is null
    or to_regclass('public.opportunity_alerts') is null
    or to_regclass('public.category_group_images') is null
    or to_regclass('public.admin_audit_logs') is null then
    raise exception 'PRE-CONDICAO: estrutura de categorias ou auditoria incompleta.';
  end if;

  if to_regprocedure('public.is_admin()') is null then
    raise exception 'PRE-CONDICAO: public.is_admin() nao existe.';
  end if;
end;
$preconditions$;

create or replace function public.get_category_group_deletion_impact_admin(
  p_group_id uuid
)
returns table (
  group_id uuid,
  group_name text,
  group_slug text,
  group_is_active boolean,
  category_count bigint,
  mapping_count bigint,
  announcement_count bigint,
  alert_count bigint,
  active_group_count bigint,
  total_group_count bigint,
  can_delete boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_group public.category_groups%rowtype;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso administrativo com MFA obrigatorio' using errcode = '42501';
  end if;

  select *
  into v_group
  from public.category_groups groups
  where groups.id = p_group_id;

  if not found then
    raise exception 'Grupo principal nao encontrado' using errcode = 'P0002';
  end if;

  return query
  with impact as (
    select
      (select count(*) from public.categories c where c.parent_group_slug = v_group.slug) as categories,
      (select count(*) from public.category_group_categories cgc where cgc.group_id = v_group.id) as mappings,
      (select count(*) from public.announcements a where a.category_group_id = v_group.id) as announcements,
      (select count(*) from public.opportunity_alerts oa where oa.category_group_id = v_group.id) as alerts,
      (select count(*) from public.category_groups cg where cg.is_active) as active_groups,
      (select count(*) from public.category_groups cg) as total_groups
  )
  select
    v_group.id,
    v_group.name,
    v_group.slug,
    v_group.is_active,
    impact.categories,
    impact.mappings,
    impact.announcements,
    impact.alerts,
    impact.active_groups,
    impact.total_groups,
    impact.categories = 0
      and impact.mappings = 0
      and impact.announcements = 0
      and impact.alerts = 0
      and impact.total_groups > 1
      and (not v_group.is_active or impact.active_groups > 1)
  from impact;
end;
$$;

create or replace function public.delete_category_group_admin_safe(
  p_group_id uuid,
  p_confirmation_name text
)
returns table (
  deleted_id uuid,
  deleted_name text,
  deleted_slug text,
  deleted_image_url text
)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_group public.category_groups%rowtype;
  v_admin public.users%rowtype;
  v_image_url text;
  v_category_count bigint;
  v_mapping_count bigint;
  v_announcement_count bigint;
  v_alert_count bigint;
  v_active_group_count bigint;
  v_total_group_count bigint;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Acesso administrativo com MFA obrigatorio' using errcode = '42501';
  end if;

  perform set_config('lock_timeout', '5s', true);
  lock table public.category_groups in share row exclusive mode;
  lock table public.categories in share row exclusive mode;
  lock table public.category_group_categories in share row exclusive mode;
  lock table public.announcements in share row exclusive mode;
  lock table public.opportunity_alerts in share row exclusive mode;

  select *
  into v_group
  from public.category_groups groups
  where groups.id = p_group_id
  for update;

  if not found then
    raise exception 'Grupo principal nao encontrado' using errcode = 'P0002';
  end if;

  if coalesce(p_confirmation_name, '') <> v_group.name then
    raise exception 'Digite o nome exato do grupo para confirmar a exclusao' using errcode = '22023';
  end if;

  select count(*) into v_category_count
  from public.categories c
  where c.parent_group_slug = v_group.slug;

  select count(*) into v_mapping_count
  from public.category_group_categories cgc
  where cgc.group_id = v_group.id;

  select count(*) into v_announcement_count
  from public.announcements a
  where a.category_group_id = v_group.id;

  select count(*) into v_alert_count
  from public.opportunity_alerts oa
  where oa.category_group_id = v_group.id;

  select count(*), count(*) filter (where is_active)
  into v_total_group_count, v_active_group_count
  from public.category_groups;

  if v_category_count > 0
    or v_mapping_count > 0
    or v_announcement_count > 0
    or v_alert_count > 0 then
    raise exception 'Remova ou transfira todos os vinculos antes de excluir o grupo'
      using errcode = '23503',
      detail = format(
        'categorias=%s, mapeamentos=%s, anuncios=%s, alertas=%s',
        v_category_count,
        v_mapping_count,
        v_announcement_count,
        v_alert_count
      );
  end if;

  if v_total_group_count <= 1 then
    raise exception 'Nao e permitido excluir o ultimo grupo principal' using errcode = '23514';
  end if;

  if v_group.is_active and v_active_group_count <= 1 then
    raise exception 'Nao e permitido excluir o ultimo grupo principal ativo' using errcode = '23514';
  end if;

  select *
  into v_admin
  from public.users users
  where users.id = auth.uid();

  if not found then
    raise exception 'Administrador nao encontrado' using errcode = '42501';
  end if;

  select images.image_url
  into v_image_url
  from public.category_group_images images
  where images.slug = v_group.slug;

  delete from public.category_group_images images
  where images.slug = v_group.slug;

  delete from public.category_groups groups
  where groups.id = v_group.id;

  insert into public.admin_audit_logs (
    admin_id,
    admin_email,
    admin_name,
    action,
    resource_type,
    resource_id,
    old_value,
    new_value,
    reason,
    metadata
  ) values (
    v_admin.id,
    coalesce(v_admin.email, 'email-indisponivel'),
    coalesce(v_admin.name, v_admin.email, 'Administrador'),
    'DELETE_CATEGORY_GROUP',
    'category_group',
    v_group.id,
    jsonb_build_object(
      'name', v_group.name,
      'slug', v_group.slug,
      'sort_order', v_group.sort_order,
      'icon_name', v_group.icon_name,
      'is_active', v_group.is_active,
      'image_configured', coalesce(v_image_url, '') <> ''
    ),
    null,
    format('Grupo principal %s excluido', v_group.name),
    jsonb_build_object('source', 'admin_categories')
  );

  return query
  select v_group.id, v_group.name, v_group.slug, nullif(v_image_url, '');
end;
$$;

revoke all on function public.get_category_group_deletion_impact_admin(uuid)
from public, anon, authenticated;
revoke all on function public.delete_category_group_admin_safe(uuid, text)
from public, anon, authenticated;

grant execute on function public.get_category_group_deletion_impact_admin(uuid)
to authenticated;
grant execute on function public.delete_category_group_admin_safe(uuid, text)
to authenticated;

comment on function public.get_category_group_deletion_impact_admin(uuid) is
  'Retorna dependencias de um grupo principal para confirmacao administrativa segura.';
comment on function public.delete_category_group_admin_safe(uuid, text) is
  'Exclui somente grupos vazios, preserva ao menos um grupo ativo e registra auditoria na mesma transacao.';

commit;
