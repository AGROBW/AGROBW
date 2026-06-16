-- =====================================================================
-- CAMPANHA DE LOJA PARCEIRA — FASE 5 (métricas básicas p/ o solicitante)
-- Data: 2026-06-15
-- Expõe contadores da campanha vinculada APENAS para o dono da solicitação.
-- (newsletter_campaigns é admin-only via RLS; por isso um RPC SECURITY DEFINER
--  escopado em auth.uid().)
-- Idempotente.
-- =====================================================================

create or replace function public.get_my_store_campaign_metrics()
returns table (
  request_id uuid,
  campaign_status text,
  total_recipients integer,
  sent_count integer,
  failed_count integer,
  last_sent_at timestamptz
)
language sql security definer set search_path = public
as $$
  select
    r.id,
    c.status,
    c.total_recipients,
    c.sent_count,
    c.failed_count,
    c.last_sent_at
  from public.seller_store_campaign_requests r
  join public.newsletter_campaigns c on c.id = r.campaign_id
  where r.user_id = auth.uid()
    and r.campaign_id is not null;
$$;

revoke all on function public.get_my_store_campaign_metrics() from public, anon;
grant execute on function public.get_my_store_campaign_metrics() to authenticated;
