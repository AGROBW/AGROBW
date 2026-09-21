begin;

set local lock_timeout = '5s';

do $$
begin
  if not exists (select 1 from public.announcements) then
    raise exception 'A validacao transacional exige ao menos um anuncio existente';
  end if;
  if exists (
    select 1 from public.whatsapp_gateway_settings
    where id = '00000000-0000-0000-0000-000000000020' and is_enabled
  ) then
    raise exception 'Desative a Central WhatsApp antes da validacao transacional';
  end if;
  if not exists (
    select 1 from public.whatsapp_gateway_settings settings
    where settings.id = '00000000-0000-0000-0000-000000000020'
      and settings.base_url is not null
      and nullif(trim(settings.auth_secret), '') is not null
      and settings.default_recipient_phone is not null
  ) then
    raise exception 'Complete a configuracao da Central WhatsApp antes da validacao';
  end if;
end;
$$;

lock table public.announcements in share row exclusive mode;
lock table public.whatsapp_gateway_jobs in share row exclusive mode;

create temporary table whatsapp_validation_target on commit drop as
select id
from public.announcements
order by created_at, id
limit 1;

alter table public.announcements disable trigger user;
delete from public.whatsapp_gateway_jobs
where event_type = 'admin_announcement_pending'
  and source_id = (select id from whatsapp_validation_target);
delete from public.whatsapp_announcement_moderation_state
where announcement_id = (select id from whatsapp_validation_target);
update public.announcements
set status = 'ACTIVE'
where id = (select id from whatsapp_validation_target);
alter table public.announcements enable trigger user;

update public.whatsapp_gateway_settings
set is_enabled = true
where id = '00000000-0000-0000-0000-000000000020';

create function pg_temp.force_pending_after_other_before_triggers()
returns trigger
language plpgsql
as $$
begin
  new.status := 'PENDING';
  return new;
end;
$$;

create trigger trg_zzzz_whatsapp_validation_force_pending
before update of updated_at on public.announcements
for each row execute function pg_temp.force_pending_after_other_before_triggers();

update public.announcements
set updated_at = clock_timestamp()
where id = (select id from whatsapp_validation_target);

do $$
declare
  v_target uuid := (select id from whatsapp_validation_target);
begin
  if (select moderation_cycle from public.whatsapp_announcement_moderation_state where announcement_id = v_target) <> 1 then
    raise exception 'Ciclo 1 nao foi criado pelo status final do trigger BEFORE tardio';
  end if;
  if (select count(*) from public.whatsapp_gateway_jobs where event_type = 'admin_announcement_pending' and source_id = v_target) <> 1 then
    raise exception 'O ciclo 1 nao gerou exatamente um job';
  end if;
end;
$$;

drop trigger trg_zzzz_whatsapp_validation_force_pending on public.announcements;
alter table public.announcements disable trigger user;
update public.announcements
set status = 'ACTIVE'
where id = (select id from whatsapp_validation_target);
update public.whatsapp_announcement_moderation_state
set in_moderation = false, updated_at = now()
where announcement_id = (select id from whatsapp_validation_target);
alter table public.announcements enable trigger user;

create trigger trg_zzzz_whatsapp_validation_force_pending
before update of updated_at on public.announcements
for each row execute function pg_temp.force_pending_after_other_before_triggers();

update public.announcements
set updated_at = clock_timestamp()
where id = (select id from whatsapp_validation_target);

do $$
declare
  v_target uuid := (select id from whatsapp_validation_target);
begin
  if (select moderation_cycle from public.whatsapp_announcement_moderation_state where announcement_id = v_target) <> 2 then
    raise exception 'A reentrada por trigger BEFORE tardio nao criou o ciclo 2';
  end if;
  if (select count(*) from public.whatsapp_gateway_jobs where event_type = 'admin_announcement_pending' and source_id = v_target) <> 2 then
    raise exception 'Os ciclos 1 e 2 nao geraram exatamente dois jobs';
  end if;
  if exists (
    select 1
    from public.whatsapp_gateway_jobs
    where event_type = 'admin_announcement_pending'
      and source_id = v_target
    group by event_cycle
    having count(*) <> 1
  ) then
    raise exception 'Foi criado mais de um job para o mesmo ciclo';
  end if;
end;
$$;

delete from public.whatsapp_announcement_moderation_state
where announcement_id = (select id from whatsapp_validation_target);

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
where announcements.id = (select id from whatsapp_validation_target);

do $$
begin
  if (
    select moderation_cycle
    from public.whatsapp_announcement_moderation_state
    where announcement_id = (select id from whatsapp_validation_target)
  ) <> 2 then
    raise exception 'A reconstrucao do estado nao preservou o maior ciclo historico';
  end if;
end;
$$;

alter table public.announcements disable trigger user;
update public.announcements
set status = 'ACTIVE'
where id = (select id from whatsapp_validation_target);
update public.whatsapp_announcement_moderation_state
set in_moderation = false, updated_at = now()
where announcement_id = (select id from whatsapp_validation_target);
alter table public.announcements enable trigger user;

update public.announcements
set updated_at = clock_timestamp()
where id = (select id from whatsapp_validation_target);

do $$
declare
  v_target uuid := (select id from whatsapp_validation_target);
begin
  if (select moderation_cycle from public.whatsapp_announcement_moderation_state where announcement_id = v_target) <> 3 then
    raise exception 'A reentrada apos reconstruir o estado nao criou o ciclo 3';
  end if;
  if (select count(*) from public.whatsapp_gateway_jobs where event_type = 'admin_announcement_pending' and source_id = v_target) <> 3 then
    raise exception 'Os ciclos 1, 2 e 3 nao geraram exatamente tres jobs';
  end if;
end;
$$;

rollback;
