-- =====================================================================
-- TOGGLE "OFERECER CICLO ANUAL" POR PLANO
-- Data: 2026-06-14
-- Adiciona a flag que controla se cada plano participa do ciclo anual.
-- Default true = preserva o comportamento atual (todos os planos
-- continuam oferecendo anual). Quando false, o plano some da vitrine
-- quando o cliente seleciona "Anual".
--
-- Idempotente.
-- =====================================================================

alter table public.plans
  add column if not exists has_yearly_billing boolean not null default true;

comment on column public.plans.has_yearly_billing is
  'Se false, o plano nao e oferecido no ciclo anual (some da vitrine quando "Anual" esta selecionado).';

-- Verificação:
-- select name, monthly_price, yearly_price, has_yearly_billing from public.plans order by position;
