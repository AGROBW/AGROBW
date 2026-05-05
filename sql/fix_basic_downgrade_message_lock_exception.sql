-- ============================================================================
-- AGRO BW - Excecao do plano Basico no bloqueio de novas mensagens
-- - O plano Basico (downgrade) nunca libera novos contatos, mesmo com ciclo
--   operacional de 365 dias
-- - Contatos que entraram antes do downgrade continuam acessiveis
-- - Ao voltar para um plano elegivel, contatos bloqueados sao liberados
-- - A decisao considera a assinatura efetiva do momento, evitando ambiguidades
--   caso exista historico com mais de uma assinatura ativa
-- ============================================================================

create or replace function public.seller_has_active_plan_contact_access(
  p_seller_id uuid,
  p_reference timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_effective_is_downgrade boolean := true;
  v_effective_exists boolean := false;
begin
  select
    true,
    coalesce(p.is_downgrade_plan, false)
  into v_effective_exists, v_effective_is_downgrade
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_seller_id
    and us.status = 'active'
    and p_reference >= us.current_period_start
    and p_reference <= us.current_period_end
    and coalesce(p.is_active, true) = true
  order by
    coalesce(us.current_period_start, us.created_at, now()) desc,
    coalesce(us.created_at, us.current_period_end, now()) desc
  limit 1;

  if not v_effective_exists then
    return false;
  end if;

  if v_effective_is_downgrade then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.seller_has_active_plan_contact_access(uuid, timestamptz) is
  'Retorna true apenas quando a assinatura efetiva no momento for um plano ativo elegivel para liberar novos contatos. O plano Basico de downgrade nunca libera novos contatos, independentemente da duracao do ciclo.';

update public.leads l
set contact_expires_at = case
  when coalesce(l.received_with_active_access, false) then null
  when public.seller_has_active_plan_contact_access(l.seller_id, now()) then null
  else coalesce(l.created_at, now()) - interval '1 second'
end;
