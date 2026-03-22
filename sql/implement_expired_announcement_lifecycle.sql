-- ============================================================================
-- CICLO DE VIDA DE ANUNCIOS EXPIRADOS
-- - Notifica com 5 dias de antecedencia
-- - Expira anuncio e agenda exclusao em 90 dias
-- - Bloqueia novas mensagens em anuncios expirados
-- - Permite republicacao consumindo novo credito
-- - Exclui automaticamente anuncios expirados apos 90 dias
-- ============================================================================

alter table public.announcements
  add column if not exists expired_at timestamptz,
  add column if not exists deletion_scheduled_at timestamptz,
  add column if not exists pre_expiration_notified_at timestamptz,
  add column if not exists expiration_notified_at timestamptz;

update public.announcements
set
  expired_at = coalesce(expired_at, expires_at, updated_at, created_at),
  deletion_scheduled_at = coalesce(
    deletion_scheduled_at,
    coalesce(expired_at, expires_at, updated_at, created_at) + interval '90 days'
  )
where status = 'EXPIRED'
  and (expired_at is null or deletion_scheduled_at is null);

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
  seller.name as seller_name,
  buyer.name as buyer_name
from public.chats c
left join public.announcements a on c.announcement_id = a.id
left join public.users seller on c.seller_id = seller.id
left join public.users buyer on c.buyer_id = buyer.id;

grant select on public.chats_full to authenticated;

create or replace function public.block_messages_for_expired_announcements()
returns trigger
language plpgsql
as $$
declare
  target_status text;
begin
  select a.status
    into target_status
  from public.chats c
  join public.announcements a on a.id = c.announcement_id
  where c.id = new.chat_id;

  if target_status = 'EXPIRED' then
    raise exception 'Anuncio expirado';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_messages_for_expired_announcements on public.messages;

create trigger trg_block_messages_for_expired_announcements
before insert on public.messages
for each row
execute function public.block_messages_for_expired_announcements();

create or replace function public.reactivate_expired_announcement(p_announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_announcement public.announcements%rowtype;
  active_subscription record;
  current_active_ads integer := 0;
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select *
    into target_announcement
  from public.announcements
  where id = p_announcement_id
    and user_id = current_user_id
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado');
  end if;

  if target_announcement.status <> 'EXPIRED' then
    return jsonb_build_object('success', false, 'error', 'Apenas anuncios vencidos podem ser republicados');
  end if;

  select
    us.*,
    p.max_ads,
    p.name as plan_name
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = current_user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Nao existe assinatura ativa para republicar este anuncio');
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = current_user_id
    and a.status = 'ACTIVE'
    and a.created_at >= active_subscription.current_period_start;

  if active_subscription.max_ads is not null and current_active_ads >= active_subscription.max_ads then
    return jsonb_build_object(
      'success', false,
      'error', format(
        'Voce atingiu o limite de anuncios do plano %s neste ciclo. Republicar consome um novo credito.',
        coalesce(active_subscription.plan_name, 'atual')
      )
    );
  end if;

  update public.announcements
  set
    status = 'ACTIVE',
    created_at = now(),
    updated_at = now(),
    expires_at = public.calculate_announcement_expires_at(current_user_id, now()),
    expired_at = null,
    deletion_scheduled_at = null,
    pre_expiration_notified_at = null,
    expiration_notified_at = null,
    highlight_category = false,
    highlight_category_until = null,
    highlight_home = false,
    highlight_home_until = null
  where id = p_announcement_id;

  insert into public.notifications (user_id, type, title, content, link)
  values (
    current_user_id,
    'SYSTEM',
    'Anuncio republicado',
    'Seu anuncio foi republicado com sucesso e consumiu um novo credito do ciclo atual.',
    '/#/minha-conta/anuncios'
  );

  return jsonb_build_object('success', true, 'message', 'Anuncio republicado com sucesso');
end;
$$;

grant execute on function public.reactivate_expired_announcement(uuid) to authenticated;

drop function if exists public.expire_elapsed_announcements();

create or replace function public.expire_elapsed_announcements()
returns table (
  pre_expiration_notified integer,
  expired_count integer,
  deleted_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  notified_total integer := 0;
  expired_total integer := 0;
  deleted_total integer := 0;
  expiring_ids uuid[];
  expired_ids uuid[];
  deletable_ids uuid[];
begin
  with candidates as (
    select a.id, a.user_id, a.title, a.expires_at
    from public.announcements a
    where a.status = 'ACTIVE'
      and a.expires_at is not null
      and a.expires_at > now()
      and a.expires_at <= now() + interval '5 days'
      and a.pre_expiration_notified_at is null
  ), notifications_inserted as (
    insert into public.notifications (user_id, type, title, content, link)
    select
      c.user_id,
      'SYSTEM',
      'Seu anuncio expira em 5 dias',
      format(
        'O anuncio "%s" expira em %s. Ajuste sua estrategia e prepare um novo credito se quiser republica-lo.',
        c.title,
        to_char(c.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
      ),
      '/#/minha-conta/anuncios'
    from candidates c
    returning user_id
  )
  update public.announcements a
  set pre_expiration_notified_at = now()
  where a.id in (select id from candidates);

  get diagnostics notified_total = row_count;

  select array_agg(a.id)
    into expiring_ids
  from public.announcements a
  where a.status = 'ACTIVE'
    and a.expires_at is not null
    and a.expires_at <= now();

  if expiring_ids is not null and array_length(expiring_ids, 1) > 0 then
    with expiring as (
      select id, user_id, title, expires_at
      from public.announcements
      where id = any(expiring_ids)
    )
    update public.announcements a
    set
      status = 'EXPIRED',
      expired_at = coalesce(a.expired_at, now()),
      deletion_scheduled_at = coalesce(a.deletion_scheduled_at, now() + interval '90 days'),
      expiration_notified_at = now(),
      highlight_category = false,
      highlight_category_until = null,
      highlight_home = false,
      highlight_home_until = null
    from expiring e
    where a.id = e.id;

    get diagnostics expired_total = row_count;

    insert into public.notifications (user_id, type, title, content, link)
    select
      e.user_id,
      'SYSTEM',
      'Seu anuncio expirou',
      format(
        'O anuncio "%s" expirou. Ele foi movido para a aba Vencidos e sera excluido em 90 dias se nao for republicado com um novo credito.',
        e.title
      ),
      '/#/minha-conta/anuncios'
    from expiring e;
  end if;

  select array_agg(a.id)
    into deletable_ids
  from public.announcements a
  where a.status = 'EXPIRED'
    and a.deletion_scheduled_at is not null
    and a.deletion_scheduled_at <= now();

  if deletable_ids is not null and array_length(deletable_ids, 1) > 0 then
    delete from public.announcement_clicks_by_state
    where announcement_id = any(deletable_ids);

    delete from public.announcement_highlights_history
    where announcement_id = any(deletable_ids);

    delete from public.announcement_technical_details
    where announcement_id = any(deletable_ids);

    delete from public.favorites
    where announcement_id = any(deletable_ids);

    delete from public.messages
    where chat_id in (
      select id from public.chats where announcement_id = any(deletable_ids)
    );

    delete from public.leads
    where announcement_id = any(deletable_ids)
       or chat_id in (
         select id from public.chats where announcement_id = any(deletable_ids)
       );

    delete from public.chats
    where announcement_id = any(deletable_ids);

    delete from public.announcement_metrics
    where announcement_id = any(deletable_ids);

    delete from public.lead_conversions
    where announcement_id = any(deletable_ids);

    delete from public.opportunities
    where announcement_id = any(deletable_ids);

    delete from public.opportunity_matches
    where announcement_id = any(deletable_ids);

    delete from public.price_drop_notifications
    where announcement_id = any(deletable_ids);

    delete from public.announcements
    where id = any(deletable_ids);

    get diagnostics deleted_total = row_count;
  end if;

  return query
  select notified_total, expired_total, deleted_total;
end;
$$;

grant execute on function public.expire_elapsed_announcements() to authenticated;
