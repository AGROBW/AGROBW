begin;

do $guard$
begin
  if to_regclass('public.category_groups') is null then
    raise exception 'ROLLBACK ABORTADO: public.category_groups nao existe.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'category_groups'
      and column_name = 'icon_name'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'category_groups'
      and column_name = 'is_active'
  ) then
    raise exception 'ROLLBACK ABORTADO: a migracao desta etapa nao esta aplicada por completo.';
  end if;

  if exists (
    select 1
    from public.category_groups
    where icon_name is not null
       or is_active = false
  ) then
    raise exception 'ROLLBACK ABORTADO: os novos campos ja possuem dados; remova-os conscientemente antes de descartar as colunas.';
  end if;
end;
$guard$;

drop trigger if exists category_groups_touch_updated_at
on public.category_groups;

drop function if exists public.touch_category_groups_updated_at();

drop index if exists public.category_groups_active_sort_order_idx;

drop policy if exists "public read category_groups"
on public.category_groups;

create policy "public read category_groups"
on public.category_groups
for select
to public
using (true);

alter table public.category_groups
  drop constraint if exists category_groups_icon_name_check,
  drop constraint if exists category_groups_sort_order_check,
  drop constraint if exists category_groups_slug_format_check,
  drop constraint if exists category_groups_name_check;

alter table public.category_groups
  drop column if exists is_active,
  drop column if exists icon_name;

commit;

select
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'category_groups'
      and column_name in ('icon_name', 'is_active')
  ) as rollback_confirmado;
