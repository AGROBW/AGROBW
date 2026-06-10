-- =====================================================================
-- FIX CRÍTICO — set_default_signup_plan: authz admin + revogar EXECUTE anon
-- Data: 2026-06-10 | Achado do Lote 2C
-- =====================================================================
-- VULN: public.set_default_signup_plan(uuid) é SECURITY DEFINER (roda como
-- postgres, bypassa RLS), tinha EXECUTE para anon E authenticated, e NÃO checava
-- admin no corpo. Faz UPDATE em public.plans trocando is_default_signup_plan ->
-- qualquer chamador podia trocar o plano padrão de cadastro (impacto comercial/
-- operacional) sem autorização. CRÍTICO.
--
-- Chamador legítimo: src/hooks/usePlans.ts (gestão de planos = admin) -> a função
-- deve ser ADMIN-ONLY. Correção mínima:
--   1) guarda no corpo: if not public.is_admin() then raise 'Unauthorized'.
--      (is_admin() exige aal2/MFA -> consistente com o resto do sistema)
--   2) revogar EXECUTE de anon (nunca deve poder). authenticated mantém EXECUTE,
--      pois admin opera como authenticated e a guarda interna gateia; service_role
--      mantém (jobs/edge, se houver).
--
-- Corpo PRESERVADO conforme definição viva (02_schema.sql:11345). Só adiciona a
-- guarda como PRIMEIRA instrução. Idempotente (CREATE OR REPLACE).
-- =====================================================================

create or replace function public.set_default_signup_plan(p_plan_id uuid)
returns public.plans
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_plan public.plans%rowtype;
begin
  -- NOVO: authz admin (aal2). Bloqueia anon/usuário comum.
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_plan_id is null then
    raise exception 'Plano padrao do cadastro nao informado.';
  end if;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'Plano selecionado nao foi encontrado.';
  end if;

  if coalesce(v_plan.is_downgrade_plan, false) then
    raise exception 'O plano padrao do cadastro nao pode ser o plano de downgrade.';
  end if;

  if not coalesce(v_plan.is_active, true) then
    raise exception 'O plano padrao do cadastro precisa permanecer ativo.';
  end if;

  perform set_config('app.allow_default_signup_switch', 'on', true);

  update public.plans
  set is_default_signup_plan = false
  where id <> p_plan_id
    and is_default_signup_plan = true;

  update public.plans
  set is_default_signup_plan = true
  where id = p_plan_id;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id;

  return v_plan;
end;
$$;

-- 2) least-privilege de EXECUTE
revoke execute on function public.set_default_signup_plan(uuid) from anon;
-- authenticated mantém (guarda interna is_admin()/aal2 gateia); service_role mantém.

-- =====================================================================
-- VALIDAÇÃO:
--   anon: select set_default_signup_plan('<uuid>')  -> negado (sem EXECUTE)
--   authenticated NÃO-admin (ou admin sem aal2): chamar -> exception 'Unauthorized'
--   admin (aal2) via painel de planos (usePlans.ts) -> define plano padrão OK
--   conferir: select has_function_privilege('anon','public.set_default_signup_plan(uuid)','execute'); -- false
--   conferir: plano padrão de cadastro só muda quando admin aal2 aciona
-- ROLLBACK (reverter à versão sem guarda — NÃO recomendado, reabre a vuln):
--   re-aplicar o corpo anterior (sem o bloco "NOVO") e
--   grant execute on function public.set_default_signup_plan(uuid) to anon;
-- (capture antes: select pg_get_functiondef('public.set_default_signup_plan(uuid)'::regprocedure);)
-- =====================================================================
