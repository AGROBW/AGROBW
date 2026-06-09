-- =====================================================================
-- SECURITY FIX — R1: Autorização de RPCs (IDOR/mutação)
-- Data: 2026-06-08
-- =====================================================================
-- Corrige autorização DENTRO das funções (o vetor anon é fechado em R2).
-- Escopo (validado no schema):
--   * get_active_subscription: estrutura quebrada + p_user_id arbitrário (IDOR
--     estrutural). Remove o parâmetro e usa auth.uid(). (Sem uso no frontend.)
--   * ensure_user_current_subscription: muta assinatura de p_user_id arbitrário
--     -> exige p_user_id = auth.uid() OU is_admin() (guarda a APLICAR no corpo VIVO).
--   * apply_announcement_highlight / delete_announcement_with_relations: JÁ têm
--     guarda de dono/admin -> nada a fazer aqui (só revoke anon em R2).
--
-- NÃO aplicar automaticamente. Revise contra o estado VIVO (o dump base é de
-- 2026-06-07 e pode divergir). Transacional + idempotente.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. get_active_subscription — remover parâmetro + corrigir colunas + auth
-- ---------------------------------------------------------------------
-- Estrutura antiga referenciava s.starts_at/s.expires_at (inexistentes) -> quebrada.
-- Mapeamento correto: current_period_start/current_period_end. Mantém os NOMES de
-- saída (starts_at/expires_at) para não quebrar consumidores eventuais.
-- ATENÇÃO: confirme que nenhum caller depende da assinatura com (uuid) antes de aplicar.
drop function if exists public.get_active_subscription(uuid);

create or replace function public.get_active_subscription()
returns table(
  id uuid, plan_id uuid, plan_name varchar, billing_cycle varchar, status varchar,
  starts_at timestamptz, expires_at timestamptz, amount_paid numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Nao autenticado';
  end if;

  return query
  select
    s.id,
    s.plan_id,
    p.name::varchar              as plan_name,
    s.billing_cycle::varchar     as billing_cycle,
    s.status::varchar            as status,
    s.current_period_start       as starts_at,
    s.current_period_end         as expires_at,
    s.amount_paid
  from public.user_subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = auth.uid()
    and s.status = 'active'
    and s.current_period_end > now()
  order by s.current_period_end desc
  limit 1;
end;
$$;

revoke all     on function public.get_active_subscription() from anon, public;
grant  execute on function public.get_active_subscription() to authenticated;

-- (Alternativa recomendada se confirmar que é função MORTA:
--   drop function if exists public.get_active_subscription();   -- e remover de vez)

-- ---------------------------------------------------------------------
-- 2. ensure_user_current_subscription — GUARDA a aplicar no corpo VIVO
-- ---------------------------------------------------------------------
-- NÃO redefino o corpo aqui de propósito: a função é grande e ativa, e o dump
-- base pode estar desatualizado — copiar o corpo do dump arriscaria sobrescrever
-- lógica nova. Em vez disso, ADICIONE este bloco logo após o `begin;` da função
-- VIVA (editando a definição atual no banco):
--
--   -- autorização: só o próprio usuário ou admin; contexto interno (service_role/
--   -- trigger/cron) tem auth.uid() nulo e segue permitido.
--   if auth.uid() is not null
--      and p_user_id is distinct from auth.uid()
--      and not public.is_admin() then
--     raise exception 'Acesso negado';
--   end if;
--
-- Depois, restrinja a execução:
--   revoke all on function public.ensure_user_current_subscription(uuid) from anon, public;
--   grant execute on function public.ensure_user_current_subscription(uuid) to authenticated, service_role;

commit;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- -- get_active_subscription sem parâmetro e sem anon:
-- select proname, pg_get_function_identity_arguments(oid),
--        has_function_privilege('anon', oid, 'EXECUTE') as anon_exec
-- from pg_proc where proname='get_active_subscription';
--
-- TESTES (como ANON e como usuário comum):
--   * rpc get_active_subscription  (anon)         -> permission denied
--   * rpc ensure_user_current_subscription com p_user_id de OUTRO (autenticado) -> 'Acesso negado'
-- =====================================================================
