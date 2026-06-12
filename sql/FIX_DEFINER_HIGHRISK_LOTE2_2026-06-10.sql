-- =====================================================================
-- LOTE 2 (definers high-risk) — guarda authz / revoke execute + search_path
-- Data: 2026-06-10 | as 3 estão expostas a authenticated (anon=false).
-- =====================================================================
-- ⚠️ check_user_plan_active: o corpo abaixo foi capturado do dump (2026-06-07).
--    VALIDAR contra o vivo antes de aplicar:
--    select pg_get_functiondef('public.check_user_plan_active(uuid)'::regprocedure);
--    Se divergir, aplicar APENAS a guarda nova (-- NOVO) + o SET search_path.
-- =====================================================================

begin;

-- ── (1) check_user_plan_active(uuid) ──────────────────────────────────────────
-- Risco: chama ensure_user_current_subscription(user_uuid) que INSERE
-- subscription/notification/admin_audit_logs -> com user_uuid arbitrário =
-- IDOR-write (criar sub/spam p/ outro). Guarda: dono OU admin; auth.uid() NULL
-- (service_role/cron) passa; anon não executa (anon_exec=false).
create or replace function public.check_user_plan_active(user_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = public                       -- NOVO: fixar search_path
as $$
declare
  is_active boolean := false;
begin
  -- NOVO: bloquear IDOR-write. Permite dono, admin e contexto de servico (uid null).
  if auth.uid() is not null and auth.uid() <> user_uuid and not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  perform public.ensure_user_current_subscription(user_uuid);

  select exists (
    select 1
    from public.user_subscriptions us
    where us.user_id = user_uuid
      and us.status = 'active'
      and now() < us.current_period_end
  ) into is_active;

  return is_active;
end;
$$;

-- ── (2) check_rate_limit(uuid, text, integer, integer) ────────────────────────
-- Consumer legítimo = edge _shared/rateLimit.ts (service_role). Não deve ser
-- chamável por usuário (inflar/zerar contador de terceiro). Revogar authenticated.
revoke execute on function public.check_rate_limit(uuid, text, integer, integer) from authenticated;
alter function public.check_rate_limit(uuid, text, integer, integer) set search_path = public;

-- ── (3) expire_old_subscriptions() ────────────────────────────────────────────
-- Manutenção em lote (cron/service_role). Não deve ser pública.
revoke execute on function public.expire_old_subscriptions() from authenticated;
alter function public.expire_old_subscriptions() set search_path = public;

commit;

-- =====================================================================
-- VALIDAÇÃO:
--   check_user_plan_active:
--     usuario comum chamando com o PRÓPRIO uid -> funciona (retorna boolean).
--     usuario comum chamando com uid de OUTRO -> exception 'Unauthorized'
--       (e SEM criar subscription/notification para o outro).
--     admin (aal2) com uid de outro -> funciona.
--     edge/service_role (auth.uid() null) -> funciona.
--     proconfig mostra search_path=public.
--   check_rate_limit / expire_old_subscriptions:
--     authenticated: select has_function_privilege('authenticated','public.check_rate_limit(uuid,text,integer,integer)','execute') -> false
--     edge (service_role) continua chamando normalmente; rate limiting e expiração seguem.
--     proconfig de ambas mostra search_path=public.
-- ROLLBACK:
--   check_user_plan_active: re-aplicar a versao anterior (sem a guarda) — capturar antes.
--   grant execute on function public.check_rate_limit(uuid,text,integer,integer) to authenticated;
--   grant execute on function public.expire_old_subscriptions() to authenticated;
-- =====================================================================
