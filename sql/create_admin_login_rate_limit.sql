create or replace function public.get_admin_login_rate_limit_status(
  p_email text
)
returns table (
  attempts_used integer,
  remaining_attempts integer,
  is_blocked boolean,
  blocked_until timestamptz,
  time_until_unblock_seconds integer,
  should_show_captcha boolean,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_server_now timestamptz := now();
  v_last_success_at timestamptz;
  v_attempts_used integer := 0;
  v_last_failure_at timestamptz;
  v_blocked_until timestamptz;
begin
  if v_email = '' then
    return query
    select
      0,
      5,
      false,
      null::timestamptz,
      0,
      false,
      v_server_now;
    return;
  end if;

  select max(se.created_at)
    into v_last_success_at
  from public.security_events se
  where lower(trim(coalesce(se.email, ''))) = v_email
    and se.attempted_route = '/admin/login'
    and se.attempted_action = 'admin_login_success';

  select
    count(*)::integer,
    max(se.created_at)
  into
    v_attempts_used,
    v_last_failure_at
  from public.security_events se
  where lower(trim(coalesce(se.email, ''))) = v_email
    and se.attempted_route = '/admin/login'
    and se.attempted_action = 'admin_login_failed'
    and se.created_at >= greatest(
      coalesce(v_last_success_at, '-infinity'::timestamptz),
      v_server_now - interval '15 minutes'
    );

  if v_attempts_used >= 5 and v_last_failure_at is not null then
    v_blocked_until := v_last_failure_at + interval '30 minutes';
  end if;

  return query
  select
    v_attempts_used,
    greatest(0, 5 - v_attempts_used),
    coalesce(v_blocked_until > v_server_now, false),
    case when v_blocked_until > v_server_now then v_blocked_until else null end,
    case
      when v_blocked_until > v_server_now
        then greatest(0, floor(extract(epoch from (v_blocked_until - v_server_now)))::integer)
      else 0
    end,
    v_attempts_used >= 2,
    v_server_now;
end;
$$;

create or replace function public.register_admin_login_attempt(
  p_email text,
  p_success boolean,
  p_reason text default null,
  p_user_agent text default null
)
returns table (
  attempts_used integer,
  remaining_attempts integer,
  is_blocked boolean,
  blocked_until timestamptz,
  time_until_unblock_seconds integer,
  should_show_captcha boolean,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_status record;
begin
  if v_email = '' then
    return query
    select *
    from public.get_admin_login_rate_limit_status(v_email);
    return;
  end if;

  select *
    into v_status
  from public.get_admin_login_rate_limit_status(v_email)
  limit 1;

  if coalesce(v_status.is_blocked, false) and not p_success then
    perform public.log_security_event(
      p_user_id := null,
      p_email := v_email,
      p_attempted_route := '/admin/login',
      p_attempted_action := 'admin_login_blocked',
      p_user_agent := p_user_agent,
      p_severity := 'blocked',
      p_reason := coalesce(p_reason, 'Tentativa bloqueada por excesso de falhas consecutivas.'),
      p_metadata := jsonb_build_object(
        'blocked_until', v_status.blocked_until,
        'attempts_used', v_status.attempts_used
      )
    );

    return query
    select
      v_status.attempts_used,
      v_status.remaining_attempts,
      v_status.is_blocked,
      v_status.blocked_until,
      v_status.time_until_unblock_seconds,
      v_status.should_show_captcha,
      v_status.server_now;
    return;
  end if;

  perform public.log_security_event(
    p_user_id := null,
    p_email := v_email,
    p_attempted_route := '/admin/login',
    p_attempted_action := case when p_success then 'admin_login_success' else 'admin_login_failed' end,
    p_user_agent := p_user_agent,
    p_severity := case when p_success then 'info' else 'warning' end,
    p_reason := p_reason,
    p_metadata := jsonb_build_object(
      'email', v_email,
      'success', p_success
    )
  );

  return query
  select *
  from public.get_admin_login_rate_limit_status(v_email);
end;
$$;

grant execute on function public.get_admin_login_rate_limit_status(text) to anon, authenticated, service_role;
grant execute on function public.register_admin_login_attempt(text, boolean, text, text) to anon, authenticated, service_role;
