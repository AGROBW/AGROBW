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
  ), updated_candidates as (
    update public.announcements a
    set pre_expiration_notified_at = now()
    from candidates c
    where a.id = c.id
    returning c.user_id, c.title, c.expires_at
  )
  insert into public.notifications (user_id, type, title, content, link)
  select
    c.user_id,
    'SYSTEM',
    'Seu anuncio expira em 5 dias',
    format(
      'O anuncio "%s" expira em %s. Se quiser mantelo na vitrine depois do vencimento, sera necessario ter vaga disponivel no plano atual para reativa-lo.',
      c.title,
      to_char(c.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
    ),
    '/#/minha-conta/anuncios'
  from updated_candidates c;

  get diagnostics notified_total = row_count;

  with expiring as (
    update public.announcements a
    set
      status = 'EXPIRED',
      expired_at = coalesce(a.expired_at, now()),
      deletion_scheduled_at = coalesce(
        a.deletion_scheduled_at,
        public.calculate_announcement_deletion_scheduled_at(a.user_id, now())
      ),
      expiration_notified_at = now(),
      highlight_category = false,
      highlight_category_until = null,
      highlight_home = false,
      highlight_home_until = null
    where a.status = 'ACTIVE'
      and a.expires_at is not null
      and a.expires_at <= now()
    returning a.id
  )
  select array_agg(id), count(*)
    into expired_ids, expired_total
  from expiring;

  if expired_ids is not null and array_length(expired_ids, 1) > 0 then
    insert into public.notifications (user_id, type, title, content, link)
    select
      a.user_id,
      'SYSTEM',
      'Seu anuncio expirou',
      format(
        'O anuncio "%s" expirou. Ele foi movido para a aba Vencidos e podera ser reativado apenas se houver vaga disponivel no plano atual. Caso contrario, seguira para exclusao automatica em %s.',
        a.title,
        to_char(a.deletion_scheduled_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY')
      ),
      '/#/minha-conta/anuncios'
    from public.announcements a
    where a.id = any(expired_ids);
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
grant execute on function public.expire_elapsed_announcements() to service_role;
