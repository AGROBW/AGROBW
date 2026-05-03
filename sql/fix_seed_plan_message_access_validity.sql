-- ============================================================================
-- AGRO BW - Ajuste do bloqueio de mensagens para o plano inicial "Semente"
-- - Usa a vigencia de qualquer plano ativo nao-downgrade como criterio
-- - Mantem o plano basico de downgrade bloqueando novos contatos
-- - Libera automaticamente contatos antes bloqueados quando o usuario volta a
--   ter um plano elegivel ativo
-- ============================================================================

drop trigger if exists trg_refresh_lead_windows_after_subscription_change on public.user_subscriptions;
drop trigger if exists trg_sync_lead_contact_expires_at on public.leads;
drop trigger if exists trg_block_messages_for_expired_announcements on public.messages;

drop function if exists public.sync_lead_windows_after_subscription_change();
drop function if exists public.sync_lead_contact_expires_at();
drop function if exists public.refresh_seller_lead_contact_windows(uuid);
drop function if exists public.seller_has_active_paid_contact_access(uuid, timestamptz);
drop function if exists public.seller_has_active_plan_contact_access(uuid, timestamptz);
drop function if exists public.block_messages_for_expired_announcements();

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
  v_has_access boolean := false;
begin
  select exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = p_seller_id
      and us.status = 'active'
      and p_reference >= us.current_period_start
      and p_reference <= us.current_period_end
      and coalesce(p.is_active, true) = true
      and coalesce(p.is_downgrade_plan, false) = false
  )
  into v_has_access;

  return coalesce(v_has_access, false);
end;
$$;

create or replace function public.sync_lead_contact_expires_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_at is null then
    new.created_at := now();
  end if;

  new.received_with_active_access := public.seller_has_active_plan_contact_access(
    new.seller_id,
    new.created_at
  );

  new.contact_expires_at := case
    when new.received_with_active_access then null
    else new.created_at
  end;

  return new;
end;
$$;

create trigger trg_sync_lead_contact_expires_at
before insert or update of seller_id, created_at
on public.leads
for each row
execute function public.sync_lead_contact_expires_at();

update public.leads l
set received_with_active_access = public.seller_has_active_plan_contact_access(
      l.seller_id,
      coalesce(l.created_at, now())
    );

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
  set contact_expires_at = case
    when coalesce(l.received_with_active_access, false) then null
    when public.seller_has_active_plan_contact_access(l.seller_id, now()) then null
    else coalesce(l.created_at, now())
  end
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

create trigger trg_refresh_lead_windows_after_subscription_change
after insert or update of plan_id, status, current_period_start, current_period_end
on public.user_subscriptions
for each row
execute function public.sync_lead_windows_after_subscription_change();

update public.leads l
set contact_expires_at = case
  when coalesce(l.received_with_active_access, false) then null
  when public.seller_has_active_plan_contact_access(l.seller_id, now()) then null
  else coalesce(l.created_at, now())
end;

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
    raise exception 'Novo contato bloqueado por vigencia inativa';
  end if;

  return new;
end;
$$;

create trigger trg_block_messages_for_expired_announcements
before insert on public.messages
for each row
execute function public.block_messages_for_expired_announcements();

grant execute on function public.seller_has_active_plan_contact_access(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.refresh_seller_lead_contact_windows(uuid) to authenticated, service_role;
