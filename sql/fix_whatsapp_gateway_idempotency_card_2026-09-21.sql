begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regclass('public.whatsapp_gateway_jobs') is null
    or to_regclass('public.whatsapp_gateway_settings') is null
    or to_regclass('public.announcements') is null
    or to_regclass('public.leads') is null then
    raise exception 'A Central WhatsApp precisa estar instalada antes desta correcao';
  end if;
  if exists (
    select 1 from public.whatsapp_gateway_settings
    where id = '00000000-0000-0000-0000-000000000020' and is_enabled
  ) then
    raise exception 'Desative a Central WhatsApp antes de aplicar esta correcao';
  end if;
end;
$$;

lock table public.announcements in share row exclusive mode;
lock table public.whatsapp_gateway_jobs in share row exclusive mode;

alter table public.whatsapp_gateway_jobs
  add column if not exists idempotency_key uuid;
alter table public.whatsapp_gateway_jobs
  add column if not exists idempotency_contract_version text;
update public.whatsapp_gateway_jobs
set
  idempotency_key = id,
  idempotency_contract_version = 'legacy-job-id-2026-09-21'
where idempotency_key is null
  or idempotency_contract_version not in ('legacy-job-id-2026-09-21', 'persisted-key-2026-09-21')
  or idempotency_contract_version is null;
alter table public.whatsapp_gateway_jobs
  alter column idempotency_key set default gen_random_uuid(),
  alter column idempotency_key set not null,
  alter column idempotency_contract_version set default 'persisted-key-2026-09-21',
  alter column idempotency_contract_version set not null;
alter table public.whatsapp_gateway_jobs
  drop constraint if exists whatsapp_gateway_jobs_idempotency_contract_version;
alter table public.whatsapp_gateway_jobs
  add constraint whatsapp_gateway_jobs_idempotency_contract_version
  check (idempotency_contract_version in ('legacy-job-id-2026-09-21', 'persisted-key-2026-09-21'));

alter table public.whatsapp_gateway_jobs
  add column if not exists event_cycle bigint;
alter table public.whatsapp_gateway_jobs
  drop constraint if exists whatsapp_gateway_jobs_event_cycle;
alter table public.whatsapp_gateway_jobs
  add constraint whatsapp_gateway_jobs_event_cycle
  check (event_cycle is null or event_cycle > 0);

update public.whatsapp_gateway_jobs jobs
set event_cycle = split_part(jobs.event_key, ':', 3)::bigint
where jobs.event_type = 'admin_announcement_pending'
  and jobs.event_cycle is null
  and jobs.event_key ~ (
    '^' || jobs.source_id::text || ':moderation:[1-9][0-9]*:(admin_default|user):'
  );

create table if not exists public.whatsapp_announcement_moderation_state (
  announcement_id uuid primary key references public.announcements(id) on delete cascade,
  moderation_cycle bigint not null default 0 check (moderation_cycle >= 0),
  in_moderation boolean not null default false,
  last_entered_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.whatsapp_announcement_moderation_state (
  announcement_id, moderation_cycle, in_moderation, last_entered_at, updated_at
)
select
  announcements.id,
  greatest(
    coalesce(cycles.max_cycle, 0),
    case when upper(coalesce(announcements.status, '')) in ('PENDING', 'UNDER_REVIEW') then 1 else 0 end
  ),
  upper(coalesce(announcements.status, '')) in ('PENDING', 'UNDER_REVIEW'),
  case when upper(coalesce(announcements.status, '')) in ('PENDING', 'UNDER_REVIEW') then now() else null end,
  now()
from public.announcements announcements
left join lateral (
  select max(jobs.event_cycle) as max_cycle
  from public.whatsapp_gateway_jobs jobs
  where jobs.event_type = 'admin_announcement_pending'
    and jobs.source_id = announcements.id
) cycles on true
on conflict (announcement_id) do update set
  moderation_cycle = greatest(
    public.whatsapp_announcement_moderation_state.moderation_cycle,
    excluded.moderation_cycle
  ),
  in_moderation = excluded.in_moderation,
  last_entered_at = case
    when excluded.in_moderation
      then coalesce(public.whatsapp_announcement_moderation_state.last_entered_at, excluded.last_entered_at)
    else public.whatsapp_announcement_moderation_state.last_entered_at
  end,
  updated_at = now();

drop trigger if exists trg_track_whatsapp_announcement_moderation_cycle on public.announcements;
drop function if exists public.track_whatsapp_announcement_moderation_cycle();

create or replace function public.queue_whatsapp_admin_announcement_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_new_in_moderation boolean := upper(coalesce(new.status, '')) in ('PENDING', 'UNDER_REVIEW');
  v_old_in_moderation boolean := false;
  v_moderation_cycle bigint;
begin
  if tg_op = 'UPDATE' then
    v_old_in_moderation := upper(coalesce(old.status, '')) in ('PENDING', 'UNDER_REVIEW');
  end if;

  if tg_op = 'INSERT' then
    if new.community_reported_to_review_at is not null then
      perform public.try_enqueue_whatsapp_gateway_event(
        'admin_announcement_reported', new.id::text || ':' || new.community_reported_to_review_at::text,
        'announcements', new.id,
        jsonb_build_object('title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300)),
        '/admin/announcement-reports'
      );
    elsif v_new_in_moderation then
      insert into public.whatsapp_announcement_moderation_state as state (
        announcement_id, moderation_cycle, in_moderation, last_entered_at, updated_at
      ) values (new.id, 1, true, now(), now())
      on conflict (announcement_id) do update set
        moderation_cycle = case
          when state.in_moderation then state.moderation_cycle
          else state.moderation_cycle + 1
        end,
        in_moderation = true,
        last_entered_at = case when state.in_moderation then state.last_entered_at else now() end,
        updated_at = now()
      returning moderation_cycle into v_moderation_cycle;

      perform public.try_enqueue_whatsapp_gateway_event(
        'admin_announcement_pending',
        new.id::text || ':moderation:' || v_moderation_cycle::text || ':admin_default',
        'announcements', new.id,
        jsonb_build_object(
          'title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300),
          'moderation_cycle', v_moderation_cycle
        ),
        '/admin/moderation'
      );
    else
      insert into public.whatsapp_announcement_moderation_state (
        announcement_id, moderation_cycle, in_moderation, updated_at
      ) values (new.id, 0, false, now())
      on conflict (announcement_id) do nothing;
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
  elsif v_new_in_moderation
    and not v_old_in_moderation
    and new.community_reported_to_review_at is null then
    insert into public.whatsapp_announcement_moderation_state as state (
      announcement_id, moderation_cycle, in_moderation, last_entered_at, updated_at
    ) values (new.id, 1, true, now(), now())
    on conflict (announcement_id) do update set
      moderation_cycle = case
        when state.in_moderation then state.moderation_cycle
        else state.moderation_cycle + 1
      end,
      in_moderation = true,
      last_entered_at = case when state.in_moderation then state.last_entered_at else now() end,
      updated_at = now()
    returning moderation_cycle into v_moderation_cycle;

    perform public.try_enqueue_whatsapp_gateway_event(
      'admin_announcement_pending',
      new.id::text || ':moderation:' || v_moderation_cycle::text || ':admin_default',
      'announcements', new.id,
      jsonb_build_object(
        'title', left(coalesce(nullif(trim(new.title), ''), 'Anuncio'), 300),
        'moderation_cycle', v_moderation_cycle
      ),
      '/admin/moderation'
    );
  end if;

  if v_old_in_moderation and not v_new_in_moderation then
    insert into public.whatsapp_announcement_moderation_state (
      announcement_id, moderation_cycle, in_moderation, updated_at
    ) values (new.id, 0, false, now())
    on conflict (announcement_id) do update set
      in_moderation = false,
      updated_at = now();
  elsif v_new_in_moderation then
    insert into public.whatsapp_announcement_moderation_state (
      announcement_id, moderation_cycle, in_moderation, last_entered_at, updated_at
    ) values (new.id, 1, true, now(), now())
    on conflict (announcement_id) do update set
      in_moderation = true,
      updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_queue_whatsapp_admin_announcement on public.announcements;
create trigger trg_queue_whatsapp_admin_announcement
after insert or update on public.announcements
for each row execute function public.queue_whatsapp_admin_announcement_event();

create or replace function public.prepare_whatsapp_gateway_job_contract()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_cycle bigint;
  v_chat_id uuid;
  v_image_url text;
begin
  new.idempotency_key := coalesce(new.idempotency_key, gen_random_uuid());

  if new.event_type = 'admin_announcement_pending' and new.source_id is not null then
    select state.moderation_cycle into v_cycle
    from public.whatsapp_announcement_moderation_state state
    where state.announcement_id = new.source_id;
    v_cycle := greatest(coalesce(v_cycle, 1), 1);
    new.event_cycle := v_cycle;
    new.event_key := new.source_id::text || ':moderation:' || v_cycle::text || ':'
      || new.recipient_kind || ':' || coalesce(new.recipient_user_id::text, 'default');
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('moderation_cycle', v_cycle);
  elsif new.event_type = 'seller_new_lead' and new.source_id is not null then
    select leads.chat_id, nullif(trim(announcements.images[1]), '')
    into v_chat_id, v_image_url
    from public.leads leads
    join public.announcements announcements on announcements.id = leads.announcement_id
    where leads.id = new.source_id;

    if v_image_url !~* '^https://dockpbyzrvgewgdoaibn\.supabase\.co/storage/v1/object/public/ads-images/.+\.(jpe?g|png|webp)$' then
      v_image_url := null;
    end if;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'image_url', v_image_url,
        'action_url', case when v_chat_id is not null
          then 'https://agrobw.com.br/minha-conta/mensagens?chat=' || v_chat_id::text
          else null
        end,
        'gateway_contract_version', '2026-09-18',
        'message_type', 'transactional_card'
      ));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prepare_whatsapp_gateway_job_contract on public.whatsapp_gateway_jobs;
create trigger trg_prepare_whatsapp_gateway_job_contract
before insert on public.whatsapp_gateway_jobs
for each row execute function public.prepare_whatsapp_gateway_job_contract();

with ranked as (
  select
    jobs.id,
    row_number() over (
      partition by jobs.event_type, jobs.source_id, jobs.recipient_kind,
        coalesce(jobs.recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
      order by jobs.created_at, jobs.id
    ) as occurrence
  from public.whatsapp_gateway_jobs jobs
  where jobs.event_type = 'admin_announcement_pending'
    and jobs.status in ('pending', 'processing', 'retry')
    and jobs.idempotency_contract_version = 'legacy-job-id-2026-09-21'
    and jobs.event_cycle is null
)
update public.whatsapp_gateway_jobs jobs
set
  status = 'skipped',
  last_error_code = 'DUPLICATE_MODERATION_EVENT',
  locked_at = null,
  locked_by = null,
  updated_at = now()
from ranked
where ranked.id = jobs.id and ranked.occurrence > 1;

update public.whatsapp_gateway_jobs legacy_jobs
set
  status = 'skipped',
  last_error_code = 'DUPLICATE_MODERATION_EVENT',
  locked_at = null,
  locked_by = null,
  updated_at = now()
from public.whatsapp_announcement_moderation_state state
where legacy_jobs.event_type = 'admin_announcement_pending'
  and legacy_jobs.source_id = state.announcement_id
  and legacy_jobs.status in ('pending', 'processing', 'retry')
  and legacy_jobs.idempotency_contract_version = 'legacy-job-id-2026-09-21'
  and legacy_jobs.event_cycle is null
  and exists (
    select 1
    from public.whatsapp_gateway_jobs canonical_jobs
    where canonical_jobs.event_type = legacy_jobs.event_type
      and canonical_jobs.source_id = legacy_jobs.source_id
      and canonical_jobs.event_cycle = state.moderation_cycle
      and canonical_jobs.recipient_kind = legacy_jobs.recipient_kind
      and canonical_jobs.recipient_user_id is not distinct from legacy_jobs.recipient_user_id
  );

update public.whatsapp_gateway_jobs jobs
set
  event_cycle = state.moderation_cycle,
  event_key = jobs.source_id::text || ':moderation:' || state.moderation_cycle::text || ':'
    || jobs.recipient_kind || ':' || coalesce(jobs.recipient_user_id::text, 'default'),
  metadata = coalesce(jobs.metadata, '{}'::jsonb)
    || jsonb_build_object('moderation_cycle', state.moderation_cycle),
  updated_at = now()
from public.whatsapp_announcement_moderation_state state
where jobs.event_type = 'admin_announcement_pending'
  and jobs.source_id = state.announcement_id
  and jobs.status in ('pending', 'processing', 'retry')
  and jobs.idempotency_contract_version = 'legacy-job-id-2026-09-21'
  and jobs.event_cycle is null
  and state.in_moderation;

create unique index if not exists idx_whatsapp_gateway_jobs_idempotency_key
  on public.whatsapp_gateway_jobs (idempotency_key);
create unique index if not exists idx_whatsapp_gateway_jobs_moderation_cycle_unique
  on public.whatsapp_gateway_jobs (
    event_type,
    source_id,
    event_cycle,
    recipient_kind,
    coalesce(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where event_type = 'admin_announcement_pending' and event_cycle is not null;

alter table public.whatsapp_announcement_moderation_state enable row level security;
alter table public.whatsapp_announcement_moderation_state force row level security;
revoke all on table public.whatsapp_announcement_moderation_state from public, anon, authenticated;
grant select, insert, update, delete on table public.whatsapp_announcement_moderation_state to service_role;

revoke all on function public.queue_whatsapp_admin_announcement_event() from public, anon, authenticated;
revoke all on function public.prepare_whatsapp_gateway_job_contract() from public, anon, authenticated;

comment on column public.whatsapp_gateway_jobs.idempotency_key is
  'Chave UUID persistida no nascimento do evento e reutilizada em todas as tentativas.';
comment on column public.whatsapp_gateway_jobs.event_cycle is
  'Ciclo persistido do evento de dominio; usado para unicidade de moderacao.';
comment on table public.whatsapp_announcement_moderation_state is
  'Estado privado que avanca o ciclo apenas na entrada real em moderacao.';

commit;
