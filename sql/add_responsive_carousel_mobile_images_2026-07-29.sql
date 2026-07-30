-- ============================================================================
-- Migração aditiva — Carrossel responsivo da Home (Fase 1)
-- Data: 2026-07-29
-- Escopo: SOMENTE banco. Adiciona colunas nullable para arte mobile/tablet e
--         recria a RPC do carrossel de patrocinadores acrescentando APENAS
--         mobile_banner_url, mantendo integralmente assinatura, lógica,
--         SECURITY DEFINER, search_path e grants atuais.
--
-- Retrocompatível: as colunas são nullable e o código atualmente em produção
-- NÃO as lê; a RPC ganha uma coluna extra (o cliente lê por nome). Nada de
-- textos, links, analytics, ordenação, rotação ou filtros é alterado.
--
-- NÃO aplicar automaticamente. Rodar por seções, revisando o PREVIEW antes e
-- as consultas de VALIDAÇÃO depois. As seções mutantes estão em uma transação.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- SEÇÃO 0 — PREVIEW (read-only; rodar ANTES de aplicar)
-- ----------------------------------------------------------------------------

-- 0.1 As colunas ainda NÃO devem existir (esperado: 0 linhas).
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'home_banners'  and column_name = 'mobile_image_url') or
    (table_name = 'site_sponsors' and column_name = 'mobile_banner_url')
  );

-- 0.2 Capturar a definição ATUAL da RPC (guardar a saída como backup de rollback).
select pg_get_functiondef('public.get_public_home_carousel_sponsors()'::regprocedure) as current_definition;

-- 0.3 Estado atual da RPC: SECURITY DEFINER (prosecdef=true) + search_path.
select p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_public_home_carousel_sponsors';

-- 0.4 Grants atuais da RPC (esperado: anon + authenticated com EXECUTE).
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'get_public_home_carousel_sponsors';

-- 0.5 Baseline funcional (contagem que deve permanecer idêntica após a migração).
select count(*) as sponsors_no_carrossel from public.get_public_home_carousel_sponsors();
select count(*) as banners_totais from public.home_banners;


-- ----------------------------------------------------------------------------
-- SEÇÃO 1 — APLICAÇÃO (transação atômica)
-- ----------------------------------------------------------------------------
begin;

-- 1.1 home_banners: arte mobile/tablet opcional (nullable, idempotente).
alter table public.home_banners
  add column if not exists mobile_image_url text;

comment on column public.home_banners.mobile_image_url is
  'URL opcional da arte mobile/tablet (proporção ~16:10, recomendação 1200x750). '
  'Usada até 1023px; NULL => usar image_url (desktop) como fallback.';

-- 1.2 site_sponsors: arte mobile/tablet opcional (nullable, idempotente).
alter table public.site_sponsors
  add column if not exists mobile_banner_url text;

comment on column public.site_sponsors.mobile_banner_url is
  'URL opcional da arte mobile/tablet do slide de patrocinador no carrossel da home '
  '(proporção ~16:10). Usada até 1023px; NULL => usar banner_url (desktop) como fallback. '
  'NÃO afeta o placement de patrocinadores fora do carrossel (SiteSponsorShowcase).';

-- 1.3 Recriar a RPC do carrossel de patrocinadores.
--     Motivo do DROP: acrescentar uma coluna ao RETURNS TABLE muda o tipo de
--     retorno, o que CREATE OR REPLACE NÃO permite ("cannot change return type").
--     A assinatura chamável — get_public_home_carousel_sponsors() — é preservada.
--     Toda a lógica, filtros, coalesces, ordenação, SECURITY DEFINER e search_path
--     são MANTIDOS IDÊNTICOS; a ÚNICA adição é a coluna mobile_banner_url.
--     Concorrência: como DROP e CREATE ocorrem na MESMA transação, NÃO há janela
--     externamente observável em que a função deixe de existir — o DROP toma um
--     lock e uma chamada concorrente apenas aguarda até o COMMIT, quando passa a
--     ver a nova versão (ou recebe erro se abortarmos). Sem indisponibilidade real.
drop function if exists public.get_public_home_carousel_sponsors();

create function public.get_public_home_carousel_sponsors()
returns table (
  id uuid,
  company_name text,
  segment text,
  banner_url text,
  mobile_banner_url text,               -- <<< ÚNICA adição (nullable)
  target_type text,
  target_url text,
  home_badge_text text,
  home_title text,
  home_subtitle text,
  home_button_text text,
  home_carousel_sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.company_name,
    s.segment,
    s.banner_url,
    s.mobile_banner_url,                 -- <<< ÚNICA adição (raw, pode ser null)
    s.target_type,
    s.target_url,
    coalesce(nullif(trim(s.home_badge_text), ''), 'Patrocinador AGRO BW') as home_badge_text,
    coalesce(nullif(trim(s.home_title), ''), s.company_name) as home_title,
    coalesce(
      nullif(trim(s.home_subtitle), ''),
      format('%s em destaque na home da AGRO BW.', s.segment)
    ) as home_subtitle,
    coalesce(nullif(trim(s.home_button_text), ''), 'Conhecer patrocinador') as home_button_text,
    coalesce(s.home_carousel_sort_order, 999) as home_carousel_sort_order
  from public.site_sponsors s
  where s.show_on_home_carousel = true
    and s.banner_url is not null
    and nullif(trim(s.banner_url), '') is not null
    and s.target_url is not null
    and nullif(trim(s.target_url), '') is not null
    and s.status = 'active'
    and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
    and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  order by coalesce(s.home_carousel_sort_order, 999) asc, s.created_at desc;
$$;

-- 1.4 Ajustar os grants ao MENOR privilégio, ESPELHANDO exatamente o estado vigente
--     confirmado na Seção 0.4: anon, authenticated, service_role e postgres com EXECUTE;
--     PUBLIC SEM EXECUTE.
--     O DROP removeu os grants anteriores e o novo CREATE FUNCTION concede EXECUTE a
--     PUBLIC por padrão; por isso revogamos PUBLIC e reconcedemos apenas aos papéis
--     atuais. postgres é o PROPRIETÁRIO da função e mantém EXECUTE implicitamente —
--     NÃO recebe GRANT explícito.
revoke execute on function public.get_public_home_carousel_sponsors() from public;
grant execute on function public.get_public_home_carousel_sponsors() to anon, authenticated, service_role;

commit;


-- ----------------------------------------------------------------------------
-- SEÇÃO 2 — VALIDAÇÃO / CONSULTAS PÓS-APLICAÇÃO (read-only; rodar DEPOIS)
-- ----------------------------------------------------------------------------

-- 2.1 As duas colunas devem existir agora, ambas text e nullable (esperado: 2 linhas, is_nullable=YES).
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'home_banners'  and column_name = 'mobile_image_url') or
    (table_name = 'site_sponsors' and column_name = 'mobile_banner_url')
  )
order by table_name;

-- 2.2 A RPC deve continuar SECURITY DEFINER (prosecdef=true) com search_path=public.
select p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'get_public_home_carousel_sponsors';

-- 2.3 O tipo de retorno deve incluir mobile_banner_url (deve aparecer na lista de colunas).
select pg_get_function_result('public.get_public_home_carousel_sponsors()'::regprocedure) as result_columns;

-- 2.4 Grants preservados: o conjunto retornado deve ser EXATAMENTE anon, authenticated,
--     service_role e postgres (proprietário) com EXECUTE, e SEM PUBLIC — idêntico à 0.4.
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public' and routine_name = 'get_public_home_carousel_sponsors';

-- 2.5 Teste funcional: mesma contagem do baseline (0.5) e nova coluna presente (null p/ todos por ora).
select count(*) as sponsors_no_carrossel_pos from public.get_public_home_carousel_sponsors();
select id, banner_url, mobile_banner_url, home_carousel_sort_order
from public.get_public_home_carousel_sponsors()
limit 5;


-- ----------------------------------------------------------------------------
-- SEÇÃO 3 — ROLLBACK (deixar COMENTADO; usar só se necessário)
-- ----------------------------------------------------------------------------
-- Observação: as colunas nullable e a coluna extra da RPC são INERTES para o
-- código atualmente em produção (que não as lê). Em geral NÃO é preciso reverter
-- o banco ao dar rollback do frontend. Reverter apenas se explicitamente exigido.
--
-- 3.1 Restaurar a RPC na assinatura/retorno ANTERIORES (sem mobile_banner_url):
--
-- begin;
-- drop function if exists public.get_public_home_carousel_sponsors();
-- create function public.get_public_home_carousel_sponsors()
-- returns table (
--   id uuid,
--   company_name text,
--   segment text,
--   banner_url text,
--   target_type text,
--   target_url text,
--   home_badge_text text,
--   home_title text,
--   home_subtitle text,
--   home_button_text text,
--   home_carousel_sort_order integer
-- )
-- language sql
-- stable
-- security definer
-- set search_path = public
-- as $$
--   select
--     s.id,
--     s.company_name,
--     s.segment,
--     s.banner_url,
--     s.target_type,
--     s.target_url,
--     coalesce(nullif(trim(s.home_badge_text), ''), 'Patrocinador AGRO BW') as home_badge_text,
--     coalesce(nullif(trim(s.home_title), ''), s.company_name) as home_title,
--     coalesce(
--       nullif(trim(s.home_subtitle), ''),
--       format('%s em destaque na home da AGRO BW.', s.segment)
--     ) as home_subtitle,
--     coalesce(nullif(trim(s.home_button_text), ''), 'Conhecer patrocinador') as home_button_text,
--     coalesce(s.home_carousel_sort_order, 999) as home_carousel_sort_order
--   from public.site_sponsors s
--   where s.show_on_home_carousel = true
--     and s.banner_url is not null
--     and nullif(trim(s.banner_url), '') is not null
--     and s.target_url is not null
--     and nullif(trim(s.target_url), '') is not null
--     and s.status = 'active'
--     and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
--     and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
--   order by coalesce(s.home_carousel_sort_order, 999) asc, s.created_at desc;
-- $$;
-- -- Reconciliar grants igual à Seção 1.4 (0.4: PUBLIC sem EXECUTE; postgres é o dono,
-- -- sem GRANT explícito):
-- revoke execute on function public.get_public_home_carousel_sponsors() from public;
-- grant execute on function public.get_public_home_carousel_sponsors() to anon, authenticated, service_role;
-- commit;
--
-- 3.2 (Opcional) Remover as colunas — SÓ se realmente necessário e após garantir
--     que nenhuma versão do frontend as consome. Ação destrutiva (apaga dados):
--
-- alter table public.home_banners  drop column if exists mobile_image_url;
-- alter table public.site_sponsors drop column if exists mobile_banner_url;
-- ============================================================================
