-- =====================================================================
-- LOTE 2 — Views Security Definer sinalizadas pelo Advisor (correção mínima, faseada)
-- Data: 2026-07-15
-- =====================================================================
-- Escopo desta frente (Fase 1 auditada e validada):
--   - category_group_resolved  -> security_invoker=on  (catálogo público; bases têm SELECT público)
--   - pricing_plans_view       -> security_invoker=on  (catálogo de planos; plans tem policy pública p/ ativos)
--   - opportunities_view       -> DROP                 (órfã no app/grafo/banco + vazamento owner-scoped p/ anon)
-- FORA do escopo:
--   - v_revenue_by_plan  -> JÁ está security_invoker=on + base admin-only. NÃO tocar.
--   - vendedores_publicos -> PRÓXIMO LOTE (view definer sobre users/PII — auditar antes).
-- Evidências Fase 1: grep app = 0 consumidor; GRAPH_REPORT sem nó de código; Q1 = 0 dependentes;
--   Q2 = bases de category/pricing com leitura pública adequada; Q3 = opportunities owner-scoped.
-- Regra: NADA de flip cego. 3a (baixo risco, rollback por toggle) antes; 3b (drop) depois, com pré-check.
-- =====================================================================


-- =====================================================================
-- PASSO 3a — security_invoker=on em category_group_resolved e pricing_plans_view
-- Baixo risco: bases já têm leitura pública -> a view herda e continua legível por anon.
-- =====================================================================
begin;

alter view public.category_group_resolved set (security_invoker = on);
alter view public.pricing_plans_view       set (security_invoker = on);

-- PREVIEW (dentro da transação): deve mostrar {security_invoker=on} nas duas.
select relname, reloptions
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and relname in ('category_group_resolved', 'pricing_plans_view')
order by relname;

-- 1ª passada: troque este COMMIT por ROLLBACK para só pré-visualizar.
-- Conferido o preview -> rode de novo com COMMIT.
commit;

-- ---------------------------------------------------------------------
-- VALIDAÇÃO PÓS-COMMIT (3a) — rodar SEPARADAMENTE, após o commit:
-- ---------------------------------------------------------------------
-- (1) setting aplicado:
--   select relname, reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and relname in ('category_group_resolved','pricing_plans_view');
--
-- (2) acesso público PRESERVADO (simula anon) — esperado: ambas > 0:
--   set role anon;
--   select count(*) as cat_rows  from public.category_group_resolved;   -- > 0
--   select count(*) as plan_rows from public.pricing_plans_view;        -- > 0
--   reset role;
--
-- (3) Vitrine no app (planos/categorias) continua carregando normalmente.

-- ---------------------------------------------------------------------
-- ROLLBACK (3a) — reverte instantâneo, sem redeploy:
-- ---------------------------------------------------------------------
--   alter view public.category_group_resolved set (security_invoker = off);
--   alter view public.pricing_plans_view       set (security_invoker = off);


-- =====================================================================
-- PASSO 3b — DROP da opportunities_view (órfã + vazamento owner-scoped p/ anon)
-- Fazer APÓS o 3a validado. Reconfirmar o pré-check antes do drop.
-- =====================================================================

-- PRÉ-CHECK (read-only) — deve retornar 0 linhas (nenhum dependente no banco):
select dep.relname as objeto_dependente, dep.relkind as tipo
from pg_depend d
join pg_rewrite r  on r.oid = d.objid
join pg_class   dep on dep.oid = r.ev_class
join pg_class   src on src.oid = d.refobjid
join pg_namespace n on n.oid = src.relnamespace
where n.nspname = 'public'
  and src.relname = 'opportunities_view'
  and dep.relname <> 'opportunities_view';

-- Se o pré-check acima voltar 0 linhas, prosseguir:
begin;

drop view if exists public.opportunities_view;   -- SEM cascade (trava se surgir dependente inesperado)

-- PREVIEW (dentro da transação): deve retornar 0 linhas (view removida).
select 1
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'opportunities_view';

-- 1ª passada: troque este COMMIT por ROLLBACK para pré-visualizar.
-- Conferido -> rode de novo com COMMIT.
commit;

-- ---------------------------------------------------------------------
-- VALIDAÇÃO PÓS-COMMIT (3b) — rodar SEPARADAMENTE:
-- ---------------------------------------------------------------------
-- (1) view sumiu:
--   select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
--   where n.nspname='public' and c.relname='opportunities_view';   -- 0 linhas
--
-- (2) App: fluxos de oportunidades/notificações (usam a TABELA public.opportunities
--     direto, não a view) seguem funcionando normalmente.
--
-- (3) Advisor deixa de listar opportunities_view.

-- ---------------------------------------------------------------------
-- ROLLBACK (3b) — recriar da definição do repo, JÁ HARDENIZADA:
--   (base: fix-remaining-ad-references.sql:78-87 — mas agora com security_invoker=on e SEM grant anon)
-- ---------------------------------------------------------------------
--   create view public.opportunities_view with (security_invoker = on) as
--   select o.id, o.user_id, o.announcement_id, o.expires_at,
--          a.title as announcement_title, a.price as announcement_price
--   from public.opportunities o
--   left join public.announcements a on o.announcement_id = a.id;
--   -- NÃO regrantar anon. Se algum consumidor legítimo exigir:
--   --   grant select on public.opportunities_view to authenticated;
-- =====================================================================
