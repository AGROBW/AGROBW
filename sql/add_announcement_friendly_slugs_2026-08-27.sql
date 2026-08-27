-- URLs amigaveis para anuncios, mantendo announcements.id como identidade interna.
-- Aplicar antes do deploy do codigo que passa a selecionar announcements.slug.

begin;

alter table public.announcements
  add column if not exists slug text;

create or replace function public.normalize_announcement_slug(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  select nullif(
    trim(both '-' from regexp_replace(
      translate(
        lower(coalesce(p_value, '')),
        'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
        'aaaaaaeeeeiiiiooooouuuucnyy'
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    )),
    ''
  );
$$;

create or replace function public.allocate_announcement_slug(
  p_title text,
  p_city text,
  p_state text,
  p_exclude_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_title text;
  v_location text;
  v_base text;
  v_candidate text;
  v_suffix integer := 1;
begin
  v_title := coalesce(public.normalize_announcement_slug(p_title), 'anuncio');
  v_location := public.normalize_announcement_slug(concat_ws('-', p_city, p_state));
  v_base := left(
    case
      when v_location is null then v_title
      else concat(v_title, '-', v_location)
    end,
    180
  );

  -- Mantém os namespaces separados: um slug nunca pode parecer o UUID legado.
  if v_base ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_base := concat('anuncio-', v_base);
  end if;

  -- Evita que duas publicacoes simultaneas reservem o mesmo slug-base.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_base, 0));

  v_candidate := v_base;
  while exists (
    select 1
      from public.announcements a
     where a.slug = v_candidate
       and (p_exclude_id is null or a.id <> p_exclude_id)
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := concat(left(v_base, 190 - length(v_suffix::text)), '-', v_suffix);
  end loop;

  return v_candidate;
end;
$$;

create or replace function public.ensure_announcement_slug()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- O endereco publico e permanente: editar o titulo nao altera links existentes.
  if tg_op = 'UPDATE' and old.slug is not null and btrim(old.slug) <> '' then
    new.slug := old.slug;
    return new;
  end if;

  new.slug := public.allocate_announcement_slug(
    new.title,
    new.city,
    new.state,
    new.id
  );
  return new;
end;
$$;

drop trigger if exists trg_ensure_announcement_slug on public.announcements;
create trigger trg_ensure_announcement_slug
before insert or update of title, city, state, slug
on public.announcements
for each row
execute function public.ensure_announcement_slug();

do $$
declare
  v_row record;
begin
  for v_row in
    select id, title, city, state
      from public.announcements
     where slug is null or btrim(slug) = ''
     order by created_at nulls last, id
  loop
    update public.announcements
       set slug = public.allocate_announcement_slug(
         v_row.title,
         v_row.city,
         v_row.state,
         v_row.id
       )
     where id = v_row.id;
  end loop;
end;
$$;

alter table public.announcements
  alter column slug set not null;

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.announcements'::regclass
       and conname = 'announcements_slug_format_check'
  ) then
    alter table public.announcements
      add constraint announcements_slug_format_check
      check (
        length(slug) <= 200
        and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        and slug !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      );
  end if;
end;
$$;

create unique index if not exists announcements_slug_unique_idx
  on public.announcements (slug);

comment on column public.announcements.slug is
  'Identificador publico permanente usado em /anuncio/:slug; announcements.id continua sendo a chave interna.';

-- O projeto usa leitura por coluna em alguns papeis. Sem estes grants, incluir
-- slug nos selects publicos pode causar permission denied para visitantes.
grant select (slug) on table public.announcements to anon;
grant select (slug) on table public.announcements to authenticated;

revoke all on function public.normalize_announcement_slug(text) from public;
revoke all on function public.allocate_announcement_slug(text, text, text, uuid) from public;
revoke all on function public.ensure_announcement_slug() from public;

commit;

-- Validacao pos-aplicacao (read-only):
-- select count(*) as total,
--        count(slug) as com_slug,
--        count(distinct slug) as slugs_unicos
--   from public.announcements;
--
-- select id, title, slug
--   from public.announcements
--  order by created_at desc nulls last
--  limit 20;
