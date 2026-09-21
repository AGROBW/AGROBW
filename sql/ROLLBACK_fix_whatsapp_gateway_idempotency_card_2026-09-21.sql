begin;

set local lock_timeout = '5s';

do $$
begin
  if exists (
    select 1 from public.whatsapp_gateway_settings
    where id = '00000000-0000-0000-0000-000000000020' and is_enabled
  ) then
    raise exception 'Desative a Central WhatsApp antes do rollback';
  end if;
end;
$$;

lock table public.announcements in share row exclusive mode;
lock table public.whatsapp_gateway_jobs in share row exclusive mode;

drop trigger if exists trg_prepare_whatsapp_gateway_job_contract on public.whatsapp_gateway_jobs;
drop trigger if exists trg_track_whatsapp_announcement_moderation_cycle on public.announcements;
drop trigger if exists trg_queue_whatsapp_admin_announcement on public.announcements;
drop function if exists public.prepare_whatsapp_gateway_job_contract();
drop function if exists public.track_whatsapp_announcement_moderation_cycle();

create or replace function public.queue_whatsapp_admin_announcement_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.community_reported_to_review_at is not null then
      perform public.try_enqueue_whatsapp_gateway_event(
        'admin_announcement_reported', new.id::text || ':' || new.community_reported_to_review_at::text,
        'announcements', new.id,
        jsonb_build_object('title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300)),
        '/admin/announcement-reports'
      );
    elsif upper(coalesce(new.status, '')) in ('PENDING', 'UNDER_REVIEW') then
      perform public.try_enqueue_whatsapp_gateway_event(
        'admin_announcement_pending',
        new.id::text || ':' || floor(extract(epoch from clock_timestamp()) / 600)::bigint::text,
        'announcements', new.id,
        jsonb_build_object('title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300)),
        '/admin/moderation'
      );
    end if;
    return new;
  end if;

  if old.community_reported_to_review_at is null and new.community_reported_to_review_at is not null then
    perform public.try_enqueue_whatsapp_gateway_event(
      'admin_announcement_reported', new.id::text || ':' || new.community_reported_to_review_at::text,
      'announcements', new.id,
      jsonb_build_object('title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300)),
      '/admin/announcement-reports'
    );
  elsif upper(coalesce(new.status, '')) in ('PENDING', 'UNDER_REVIEW')
    and upper(coalesce(old.status, '')) not in ('PENDING', 'UNDER_REVIEW')
    and new.community_reported_to_review_at is null then
    perform public.try_enqueue_whatsapp_gateway_event(
      'admin_announcement_pending',
      new.id::text || ':' || floor(extract(epoch from clock_timestamp()) / 600)::bigint::text,
      'announcements', new.id,
      jsonb_build_object('title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300)),
      '/admin/moderation'
    );
  end if;
  return new;
end;
$$;

create trigger trg_queue_whatsapp_admin_announcement
after insert or update of status, community_reported_to_review_at on public.announcements
for each row execute function public.queue_whatsapp_admin_announcement_event();

drop index if exists public.idx_whatsapp_gateway_jobs_moderation_cycle_unique;
drop index if exists public.idx_whatsapp_gateway_jobs_idempotency_key;

alter table public.whatsapp_gateway_jobs
  drop constraint if exists whatsapp_gateway_jobs_event_cycle,
  drop column if exists event_cycle,
  drop column if exists idempotency_contract_version,
  drop column if exists idempotency_key;

drop table if exists public.whatsapp_announcement_moderation_state;

commit;
