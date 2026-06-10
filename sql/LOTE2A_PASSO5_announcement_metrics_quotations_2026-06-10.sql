-- =====================================================================
-- LOTE 2A — PASSO 5 — announcement_metrics + quotations (enable RLS + lockdown)
-- Data: 2026-06-10
-- =====================================================================
-- VERIFICAÇÃO DE CONSUMIDORES INDIRETOS (read-only) — RESULTADO:
--  announcement_metrics:
--    - NENHUM .from() no app (frontend não lê direto).
--    - JOINs estão DENTRO de funções plpgsql (cálculo de price-position, linhas
--      ~6188/6546/6557 do dump) que rodam server-side -> NÃO quebram ao restringir
--      SELECT a anon/authenticated.
--    - Escrita: edge delete-announcement (service_role) + triggers. anon/auth não escrevem.
--    - NÃO é base de view pública (não há CREATE VIEW ... announcement_metrics exposto).
--  quotations:
--    - ÓRFÃ: sem view, sem trigger, sem referência no código. Seguro travar 100%.
--  => Restringir SELECT é seguro nos dois. service_role (bypassa RLS) mantém writes.
--
-- Correção: ligar RLS. announcement_metrics: SELECT só dono+admin (cobre função
-- invoker que calcula price-position do próprio usuário) e SEM policy de escrita
-- (anon/auth negados; service_role/definer continuam). quotations: SEM policy
-- (deny-all p/ anon/auth; service_role mantém) — igual ao padrão seguro de payment_settings.
-- =====================================================================

begin;

-- ---------- announcement_metrics ----------
alter table public.announcement_metrics enable row level security;

drop policy if exists "owner read announcement_metrics" on public.announcement_metrics;
create policy "owner read announcement_metrics"
  on public.announcement_metrics for select to authenticated
  using (
    public.is_admin() = true
    or exists (
      select 1 from public.announcements an
      where an.id = announcement_metrics.announcement_id
        and an.user_id = auth.uid()
    )
  );
-- (sem policy de INSERT/UPDATE/DELETE -> negado p/ anon/auth; service_role bypassa)

-- ---------- quotations ----------
alter table public.quotations enable row level security;
-- (sem nenhuma policy -> deny-all p/ anon/authenticated; service_role bypassa.
--  Se futuramente algum render público precisar ler, adicionar SELECT public então.)

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   announcement_metrics:
--     anon/authenticated comum: select * from announcement_metrics -> [] / negado
--     dono: funções de price-position (se invoker, lê as próprias métricas) -> OK
--     admin: lê tudo -> OK
--     anon/auth: insert/update -> NEGADO
--     service_role (edge delete-announcement / jobs) -> continua OK
--   quotations:
--     anon/authenticated: select/insert/update -> NEGADO
--     service_role: continua OK
--     conferir que NENHUMA tela quebrou (não há consumidor mapeado)
--   relrowsecurity=true nas duas
-- ROLLBACK:
--   alter table public.announcement_metrics disable row level security;
--   drop policy if exists "owner read announcement_metrics" on public.announcement_metrics;
--   alter table public.quotations disable row level security;
-- =====================================================================
