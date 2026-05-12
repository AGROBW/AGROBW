-- ============================================================================
-- AGRO BW - Preservar contatos ja liberados apos novos downgrades
-- - Contatos recebidos durante plano ativo continuam liberados como hoje
-- - Contatos recebidos bloqueados e liberados por upgrade passam a manter
--   memoria de desbloqueio permanente
-- - Novos downgrades nao podem bloquear novamente contatos ja liberados
-- ============================================================================

alter table public.leads
  add column if not exists unlocked_once_at timestamptz;

create or replace function public.refresh_seller_lead_contact_windows(
  p_seller_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_updated integer := 0;
begin
  update public.leads l
  set
    unlocked_once_at = case
      when coalesce(l.received_with_active_access, false) then l.unlocked_once_at
      when l.unlocked_once_at is not null then l.unlocked_once_at
      when public.seller_has_active_plan_contact_access(l.seller_id, now()) then coalesce(l.unlocked_once_at, now())
      else l.unlocked_once_at
    end,
    contact_expires_at = case
      when coalesce(l.received_with_active_access, false) then null
      when l.unlocked_once_at is not null then null
      when public.seller_has_active_plan_contact_access(l.seller_id, now()) then null
      else coalesce(l.created_at, now()) - interval '1 second'
    end
  where l.seller_id = p_seller_id;

  get diagnostics v_rows_updated = row_count;
  return v_rows_updated;
end;
$$;

update public.leads l
set
  unlocked_once_at = case
    when coalesce(l.received_with_active_access, false) then l.unlocked_once_at
    when l.unlocked_once_at is not null then l.unlocked_once_at
    when l.contact_expires_at is null then coalesce(l.unlocked_once_at, now())
    else l.unlocked_once_at
  end,
  contact_expires_at = case
    when coalesce(l.received_with_active_access, false) then null
    when l.unlocked_once_at is not null then null
    when public.seller_has_active_plan_contact_access(l.seller_id, now()) then null
    else coalesce(l.created_at, now()) - interval '1 second'
  end;

grant execute on function public.refresh_seller_lead_contact_windows(uuid) to authenticated, service_role;
