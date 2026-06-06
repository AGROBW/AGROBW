begin;

do $$
begin
  create type public.severity_level as enum ('info', 'warning', 'critical', 'blocked');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  email text,
  attempted_route text not null,
  attempted_action text,
  ip_address inet,
  user_agent text,
  severity public.severity_level not null default 'warning',
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_created_at on public.security_events(created_at desc);
create index if not exists idx_security_events_severity on public.security_events(severity);
create index if not exists idx_security_events_ip_address on public.security_events(ip_address);
create index if not exists idx_security_events_attempted_route on public.security_events(attempted_route);
create index if not exists idx_security_events_attempted_action_created_at on public.security_events(attempted_action, created_at desc);
create index if not exists idx_security_events_email_created_at on public.security_events(lower(coalesce(email, '')), created_at desc);

create or replace function public.log_security_event(
  p_user_id uuid,
  p_email text,
  p_attempted_route text,
  p_attempted_action text default null,
  p_ip_address text default null,
  p_user_agent text default null,
  p_severity text default 'warning',
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_ip_inet inet;
begin
  begin
    v_ip_inet := nullif(trim(coalesce(p_ip_address, '')), '')::inet;
  exception
    when others then
      v_ip_inet := null;
  end;

  insert into public.security_events (
    user_id,
    email,
    attempted_route,
    attempted_action,
    ip_address,
    user_agent,
    severity,
    reason,
    metadata
  )
  values (
    p_user_id,
    nullif(trim(coalesce(p_email, '')), ''),
    left(trim(coalesce(p_attempted_route, '')), 300),
    nullif(left(trim(coalesce(p_attempted_action, '')), 120), ''),
    v_ip_inet,
    left(trim(coalesce(p_user_agent, '')), 700),
    case
      when lower(coalesce(p_severity, 'warning')) in ('info', 'warning', 'critical', 'blocked')
        then lower(coalesce(p_severity, 'warning'))::public.severity_level
      else 'warning'::public.severity_level
    end,
    nullif(left(trim(coalesce(p_reason, '')), 500), ''),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

comment on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) is
'Registra evento de seguranca de forma centralizada para login admin, MFA, rate limiting e abuso de rotas.';

create or replace function public.log_unauthorized_access(
  p_attempted_route text,
  p_reason text default 'Acesso nao autorizado'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid;
  v_current_email text;
begin
  select u.id, u.email
    into v_current_user_id, v_current_email
  from public.users u
  where u.id = auth.uid()
  limit 1;

  return public.log_security_event(
    p_user_id := v_current_user_id,
    p_email := v_current_email,
    p_attempted_route := p_attempted_route,
    p_attempted_action := 'unauthorized_access',
    p_severity := 'blocked',
    p_reason := p_reason
  );
end;
$$;

grant execute on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.log_unauthorized_access(text, text) to authenticated, service_role;

alter table public.security_events enable row level security;

drop policy if exists admins_view_security_events on public.security_events;
create policy admins_view_security_events
on public.security_events
for select
using (public.is_admin());

drop policy if exists system_insert_security_events on public.security_events;
drop policy if exists no_update_security_events on public.security_events;
drop policy if exists no_delete_security_events on public.security_events;

create policy no_update_security_events
on public.security_events
for update
using (false);

create policy no_delete_security_events
on public.security_events
for delete
using (false);

grant select on public.security_events to authenticated;
revoke insert, update, delete on public.security_events from anon, authenticated;

create or replace function public.get_admin_security_overview(
  p_days integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 1), 90));
  v_since timestamptz := now() - make_interval(days => v_days);
  v_step interval := case when v_days <= 2 then interval '1 hour' else interval '1 day' end;
  v_series_start timestamptz := case
    when v_days <= 2 then date_trunc('hour', now() - interval '23 hours')
    else date_trunc('day', now() - make_interval(days => v_days - 1))
  end;
  v_series_end timestamptz := case
    when v_days <= 2 then date_trunc('hour', now())
    else date_trunc('day', now())
  end;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.';
  end if;

  return jsonb_build_object(
    'windowDays', v_days,
    'generatedAt', now(),
    'summary',
      (
        select jsonb_build_object(
          'totalEvents', count(*),
          'blockedEvents', count(*) filter (where se.severity = 'blocked'),
          'criticalEvents', count(*) filter (where se.severity = 'critical'),
          'warningEvents', count(*) filter (where se.severity = 'warning'),
          'adminLoginFailures', count(*) filter (
            where se.attempted_action in ('admin_login_invalid_credentials', 'admin_login_failed')
          ),
          'captchaFailures', count(*) filter (
            where se.attempted_action = 'admin_login_captcha_failed'
          ),
          'mfaFailures', count(*) filter (
            where se.attempted_action in (
              'admin_mfa_verify_failed',
              'admin_mfa_challenge_failed',
              'admin_mfa_enrollment_failed',
              'admin_mfa_ticket_validate_failed',
              'admin_mfa_ticket_consume_failed'
            )
          ),
          'rateLimitedEvents', count(*) filter (
            where se.attempted_action like '%rate_limited'
              or se.attempted_action = 'admin_login_blocked'
          ),
          'unauthorizedAccessEvents', count(*) filter (
            where se.attempted_action like '%forbidden'
              or se.attempted_action = 'unauthorized_access'
              or se.attempted_action = 'admin_login_non_admin_or_suspended'
          ),
          'suspiciousIps', count(distinct se.ip_address),
          'targetedEmails', count(distinct lower(trim(coalesce(se.email, '')))) filter (
            where trim(coalesce(se.email, '')) <> ''
          ),
          'uniqueRoutes', count(distinct se.attempted_route),
          'lastEventAt', max(se.created_at)
        )
        from public.security_events se
        where se.created_at >= v_since
      ),
    'topIps',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'ip', t.ip_address,
              'events', t.event_count,
              'blocked', t.blocked_count,
              'lastSeenAt', t.last_seen_at
            )
            order by t.event_count desc, t.last_seen_at desc
          )
          from (
            select
              coalesce(se.ip_address::text, 'desconhecido') as ip_address,
              count(*)::integer as event_count,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_count,
              max(se.created_at) as last_seen_at
            from public.security_events se
            where se.created_at >= v_since
            group by coalesce(se.ip_address::text, 'desconhecido')
            order by event_count desc, last_seen_at desc
            limit 5
          ) t
        ),
        '[]'::jsonb
      ),
    'topRoutes',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'route', t.attempted_route,
              'events', t.event_count,
              'blocked', t.blocked_count
            )
            order by t.event_count desc
          )
          from (
            select
              se.attempted_route,
              count(*)::integer as event_count,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_count
            from public.security_events se
            where se.created_at >= v_since
            group by se.attempted_route
            order by event_count desc
            limit 5
          ) t
        ),
        '[]'::jsonb
      ),
    'topActions',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'action', t.attempted_action,
              'events', t.event_count,
              'criticalOrBlocked', t.high_severity_count
            )
            order by t.event_count desc
          )
          from (
            select
              coalesce(se.attempted_action, 'sem_acao') as attempted_action,
              count(*)::integer as event_count,
              count(*) filter (where se.severity in ('critical', 'blocked'))::integer as high_severity_count
            from public.security_events se
            where se.created_at >= v_since
            group by coalesce(se.attempted_action, 'sem_acao')
            order by event_count desc
            limit 8
          ) t
        ),
        '[]'::jsonb
      ),
    'topTargetedEmails',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'email', t.email,
              'events', t.event_count,
              'blocked', t.blocked_count
            )
            order by t.event_count desc
          )
          from (
            select
              lower(trim(se.email)) as email,
              count(*)::integer as event_count,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_count
            from public.security_events se
            where se.created_at >= v_since
              and trim(coalesce(se.email, '')) <> ''
            group by lower(trim(se.email))
            order by event_count desc
            limit 5
          ) t
        ),
        '[]'::jsonb
      ),
    'trend',
      coalesce(
        (
          with series as (
            select generate_series(v_series_start, v_series_end, v_step) as bucket_start
          ),
          bucketed as (
            select
              s.bucket_start,
              count(se.id)::integer as total_events,
              count(*) filter (where se.severity = 'blocked')::integer as blocked_events,
              count(*) filter (where se.severity = 'critical')::integer as critical_events
            from series s
            left join public.security_events se
              on se.created_at >= s.bucket_start
             and se.created_at < s.bucket_start + v_step
             and se.created_at >= v_since
            group by s.bucket_start
            order by s.bucket_start
          )
          select jsonb_agg(
            jsonb_build_object(
              'bucket', case
                when v_days <= 2 then to_char(bucket_start at time zone 'America/Sao_Paulo', 'DD/MM HH24:00')
                else to_char(bucket_start at time zone 'America/Sao_Paulo', 'DD/MM')
              end,
              'events', total_events,
              'blocked', blocked_events,
              'critical', critical_events
            )
            order by bucket_start
          )
          from bucketed
        ),
        '[]'::jsonb
      )
  );
end;
$$;

comment on function public.get_admin_security_overview(integer) is
'Retorna um resumo agregado do Centro de Seguranca administrativo para a janela solicitada.';

grant execute on function public.get_admin_security_overview(integer) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'security_events'
    ) then
      execute 'alter publication supabase_realtime add table public.security_events';
    end if;
  end if;
end $$;

commit;
