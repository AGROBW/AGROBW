begin;

do $precondition$
begin
  if to_regclass('public.category_groups') is null then
    raise exception 'PRE-CONDICAO: public.category_groups nao existe.';
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.category_groups'::regclass
      and relrowsecurity
  ) then
    raise exception 'PRE-CONDICAO: RLS nao esta ativo em public.category_groups.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'category_groups'
      and policyname = 'admin manage category_groups'
  ) then
    raise exception 'PRE-CONDICAO: policy administrativa de category_groups nao existe.';
  end if;

  if exists (
    select 1
    from public.category_groups
    where trim(name) = ''
      or length(trim(name)) > 80
      or slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or length(slug) > 80
      or sort_order < 0
  ) then
    raise exception 'PRE-CONDICAO: existem grupos incompativeis com as novas validacoes.';
  end if;
end;
$precondition$;

alter table public.category_groups
  add column if not exists icon_name text,
  add column if not exists is_active boolean not null default true;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.category_groups'::regclass
      and conname = 'category_groups_name_check'
  ) then
    alter table public.category_groups
      add constraint category_groups_name_check
      check (name = trim(name) and length(name) between 1 and 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.category_groups'::regclass
      and conname = 'category_groups_slug_format_check'
  ) then
    alter table public.category_groups
      add constraint category_groups_slug_format_check
      check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.category_groups'::regclass
      and conname = 'category_groups_sort_order_check'
  ) then
    alter table public.category_groups
      add constraint category_groups_sort_order_check
      check (sort_order >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.category_groups'::regclass
      and conname = 'category_groups_icon_name_check'
  ) then
    alter table public.category_groups
      add constraint category_groups_icon_name_check
      check (
        icon_name is null
        or icon_name ~ '^[A-Za-z][A-Za-z0-9_-]{0,63}$'
      );
  end if;
end;
$constraints$;

create index if not exists category_groups_active_sort_order_idx
on public.category_groups (is_active, sort_order, name);

drop policy if exists "public read category_groups"
on public.category_groups;

create policy "public read category_groups"
on public.category_groups
for select
to public
using (is_active);

create or replace function public.touch_category_groups_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.touch_category_groups_updated_at()
from public, anon, authenticated;

drop trigger if exists category_groups_touch_updated_at
on public.category_groups;

create trigger category_groups_touch_updated_at
before update on public.category_groups
for each row
execute function public.touch_category_groups_updated_at();

comment on column public.category_groups.icon_name is
  'Nome do icone usado nas interfaces; valores desconhecidos usam o icone visual padrao.';

comment on column public.category_groups.is_active is
  'Controla a exibicao do grupo sem apagar seus vinculos e historico.';

do $postcondition$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'category_groups'
      and column_name = 'icon_name'
      and data_type = 'text'
  ) then
    raise exception 'POS-CONDICAO: category_groups.icon_name nao foi criada.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'category_groups'
      and column_name = 'is_active'
      and data_type = 'boolean'
  ) then
    raise exception 'POS-CONDICAO: category_groups.is_active nao foi criada.';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.category_groups'::regclass
      and tgname = 'category_groups_touch_updated_at'
      and not tgisinternal
  ) then
    raise exception 'POS-CONDICAO: trigger de updated_at nao foi criado.';
  end if;

  if to_regclass('public.category_groups_active_sort_order_idx') is null then
    raise exception 'POS-CONDICAO: indice de listagem nao foi criado.';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'category_groups'
      and policyname = 'public read category_groups'
      and qual = 'is_active'
  ) then
    raise exception 'POS-CONDICAO: policy publica nao restringe grupos inativos.';
  end if;

  if (select count(*) from public.category_groups) < 6 then
    raise exception 'POS-CONDICAO: os seis grupos existentes nao foram preservados.';
  end if;
end;
$postcondition$;

commit;

select
  count(*) as grupos,
  count(*) filter (where is_active) as grupos_ativos,
  count(*) filter (where icon_name is not null) as grupos_com_icone,
  count(*) filter (where slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$') as slugs_invalidos,
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.category_groups'::regclass
      and tgname = 'category_groups_touch_updated_at'
      and not tgisinternal
  ) as trigger_criado
from public.category_groups;
