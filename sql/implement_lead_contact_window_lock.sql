-- ============================================================================
-- BLOQUEIO DE LEADS E MENSAGENS APOS O PRAZO DE CONTATO DO PLANO
-- - Usa janela mensal/anual do plano ativo do vendedor
-- - Calcula o vencimento com base na data de criacao do anuncio
-- - Bloqueia novas mensagens apos o vencimento da janela
-- - Exponibiliza o vencimento do lead na view chats_full
-- ============================================================================

alter table public.plans
  add column if not exists lead_contact_limit_days_monthly integer,
  add column if not exists lead_contact_limit_days_yearly integer;

update public.plans
set
  lead_contact_limit_days_monthly = coalesce(lead_contact_limit_days_monthly, lead_contact_limit_days),
  lead_contact_limit_days_yearly = coalesce(lead_contact_limit_days_yearly, lead_contact_limit_days)
where lead_contact_limit_days_monthly is null
   or lead_contact_limit_days_yearly is null;

alter table public.leads
  add column if not exists contact_expires_at timestamptz;

create or replace function public.resolve_lead_contact_limit_days(
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_monthly_limit integer,
  p_yearly_limit integer,
  p_legacy_limit integer default null
)
returns integer
language plpgsql
immutable
as $$
declare
  v_total_days numeric;
begin
  if p_period_start is null or p_period_end is null then
    return coalesce(p_monthly_limit, p_yearly_limit, p_legacy_limit);
  end if;

  v_total_days := extract(epoch from (p_period_end - p_period_start)) / 86400.0;

  if v_total_days > 45 then
    return coalesce(p_yearly_limit, p_legacy_limit, p_monthly_limit);
  end if;

  return coalesce(p_monthly_limit, p_legacy_limit, p_yearly_limit);
end;
$$;

create or replace function public.calculate_lead_contact_expires_at(
  p_seller_id uuid,
  p_announcement_id uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_announcement_created_at timestamptz;
  v_limit_days integer;
begin
  select a.created_at
    into v_announcement_created_at
  from public.announcements a
  where a.id = p_announcement_id
  limit 1;

  if v_announcement_created_at is null then
    return null;
  end if;

  select public.resolve_lead_contact_limit_days(
           us.current_period_start,
           us.current_period_end,
           p.lead_contact_limit_days_monthly,
           p.lead_contact_limit_days_yearly,
           p.lead_contact_limit_days
         )
    into v_limit_days
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = p_seller_id
    and us.status = 'active'
    and now() between us.current_period_start and us.current_period_end
  order by us.current_period_end desc
  limit 1;

  if v_limit_days is null then
    return null;
  end if;

  if v_limit_days <= 0 then
    return v_announcement_created_at;
  end if;

  return v_announcement_created_at + make_interval(days => v_limit_days);
end;
$$;

create or replace function public.sync_lead_contact_expires_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.contact_expires_at := public.calculate_lead_contact_expires_at(new.seller_id, new.announcement_id);
  return new;
end;
$$;

drop trigger if exists trg_sync_lead_contact_expires_at on public.leads;

create trigger trg_sync_lead_contact_expires_at
before insert or update of seller_id, announcement_id
on public.leads
for each row
execute function public.sync_lead_contact_expires_at();

update public.leads l
set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id)
where l.contact_expires_at is null;

drop view if exists public.chats_full cascade;

create or replace view public.chats_full as
select
  c.id,
  c.announcement_id,
  c.seller_id,
  c.buyer_id,
  c.status,
  c.created_at,
  c.last_message,
  c.last_message_time,
  c.unread_count,
  a.title as ad_title,
  a.price as ad_price,
  a.images[1] as ad_image,
  a.status as announcement_status,
  a.expires_at as announcement_expires_at,
  a.expired_at as announcement_expired_at,
  a.deletion_scheduled_at as announcement_deletion_scheduled_at,
  l.contact_expires_at as lead_contact_expires_at,
  seller.name as seller_name,
  buyer.name as buyer_name
from public.chats c
left join public.announcements a on c.announcement_id = a.id
left join public.leads l on l.chat_id = c.id
left join public.users seller on c.seller_id = seller.id
left join public.users buyer on c.buyer_id = buyer.id;

grant select on public.chats_full to authenticated;

create or replace function public.block_messages_for_expired_announcements()
returns trigger
language plpgsql
as $$
declare
  target_status text;
  target_contact_expires_at timestamptz;
  target_seller_id uuid;
begin
  select
    a.status,
    l.contact_expires_at,
    c.seller_id
  into target_status, target_contact_expires_at, target_seller_id
  from public.chats c
  join public.announcements a on a.id = c.announcement_id
  left join public.leads l on l.chat_id = c.id
  where c.id = new.chat_id
  limit 1;

  if target_status = 'EXPIRED' then
    raise exception 'Anuncio expirado';
  end if;

  if target_contact_expires_at is not null
     and target_contact_expires_at <= now()
     and new.sender_id = target_seller_id then
    raise exception 'Prazo de contato do lead expirado';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_messages_for_expired_announcements on public.messages;

create trigger trg_block_messages_for_expired_announcements
before insert on public.messages
for each row
execute function public.block_messages_for_expired_announcements();

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
  set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id)
  where l.seller_id = p_seller_id;

  get diagnostics v_rows_updated = row_count;
  return v_rows_updated;
end;
$$;

create or replace function public.sync_lead_windows_after_subscription_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null then
    perform public.refresh_seller_lead_contact_windows(new.user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_lead_windows_after_subscription_change on public.user_subscriptions;

create trigger trg_refresh_lead_windows_after_subscription_change
after insert or update of plan_id, status, current_period_start, current_period_end
on public.user_subscriptions
for each row
execute function public.sync_lead_windows_after_subscription_change();

update public.leads l
set contact_expires_at = public.calculate_lead_contact_expires_at(l.seller_id, l.announcement_id);

grant execute on function public.resolve_lead_contact_limit_days(timestamptz, timestamptz, integer, integer, integer) to authenticated, service_role;
grant execute on function public.calculate_lead_contact_expires_at(uuid, uuid) to authenticated, service_role;
grant execute on function public.refresh_seller_lead_contact_windows(uuid) to authenticated, service_role;
