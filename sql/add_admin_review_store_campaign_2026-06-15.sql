-- =====================================================================
-- CAMPANHA DE LOJA PARCEIRA — FASE 3 (revisão do admin)
-- Data: 2026-06-15
-- RPC para aprovar/rejeitar solicitação. Mutação só via RPC (DML direto fechado).
-- Idempotente.
-- =====================================================================

create or replace function public.admin_review_store_campaign(
  p_request_id uuid,
  p_action text,             -- 'approve' | 'reject'
  p_reason text default null, -- obrigatório quando reject
  p_notes text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_updated uuid;
begin
  if not public.is_admin() then
    raise exception 'Acesso administrativo necessario.';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'Acao invalida.';
  end if;

  -- Atômico: o UPDATE condiciona ao status pendente e só "vence" quem mudou a linha.
  -- Evita corrida entre admins (sem select-then-update).
  if p_action = 'approve' then
    update public.seller_store_campaign_requests
       set status = 'approved',
           reviewed_by = v_admin,
           reviewed_at = now(),
           admin_notes = nullif(left(trim(coalesce(p_notes, '')), 2000), '')
     where id = p_request_id
       and status = 'pending_review'
    returning id into v_updated;
  else
    if coalesce(trim(p_reason), '') = '' then
      raise exception 'Informe o motivo da rejeicao.';
    end if;
    update public.seller_store_campaign_requests
       set status = 'rejected',
           rejection_reason = left(trim(p_reason), 500),
           reviewed_by = v_admin,
           reviewed_at = now(),
           admin_notes = nullif(left(trim(coalesce(p_notes, '')), 2000), '')
     where id = p_request_id
       and status = 'pending_review'
    returning id into v_updated;
  end if;

  if v_updated is null then
    raise exception 'Apenas solicitacoes em analise podem ser revisadas.';
  end if;
end;
$$;

revoke all on function public.admin_review_store_campaign(uuid, text, text, text) from public;
grant execute on function public.admin_review_store_campaign(uuid, text, text, text) to authenticated;
