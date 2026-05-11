alter table public.users
  add column if not exists document_last_attempt_at timestamptz,
  add column if not exists document_retry_available_at timestamptz,
  add column if not exists document_last_failure_reason text;

create index if not exists idx_users_document_retry_available_at
  on public.users (document_retry_available_at);

drop function if exists public.get_my_document_verification_retry_status();

create or replace function public.get_my_document_verification_retry_status()
returns table (
  document_review_status text,
  document_verified boolean,
  document_retry_available_at timestamptz,
  document_last_attempt_at timestamptz,
  document_last_failure_reason text,
  can_retry boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  return query
  select
    u.document_review_status,
    u.document_verified,
    u.document_retry_available_at,
    u.document_last_attempt_at,
    u.document_last_failure_reason,
    coalesce(u.document_retry_available_at <= now(), true) as can_retry
  from public.users u
  where u.id = v_user_id;
end;
$$;

grant execute on function public.get_my_document_verification_retry_status() to authenticated;

drop function if exists public.complete_my_document_verification_upload(text, text, text);

create or replace function public.complete_my_document_verification_upload(
  p_document_path text,
  p_result text,
  p_failure_reason text default null
)
returns table (
  success boolean,
  document_review_status text,
  document_verified boolean,
  document_retry_available_at timestamptz,
  document_last_failure_reason text,
  notification_created boolean,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_retry_until timestamptz;
  v_name text;
  v_failure_reason text := nullif(trim(coalesce(p_failure_reason, '')), '');
  v_notification_created boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if nullif(trim(coalesce(p_document_path, '')), '') is null then
    raise exception 'Caminho do documento nao informado.';
  end if;

  if p_result not in ('approved', 'rejected', 'pending') then
    raise exception 'Resultado de verificacao invalido.';
  end if;

  select
    u.document_retry_available_at,
    u.name
  into
    v_retry_until,
    v_name
  from public.users u
  where u.id = v_user_id
  for update;

  if v_retry_until is not null and v_retry_until > v_now then
    raise exception 'Nova tentativa disponivel somente em %.', to_char(v_retry_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
  end if;

  if p_result = 'approved' then
    update public.users
    set
      document_path = p_document_path,
      document_verified = true,
      document_review_status = 'approved',
      document_review_notes = null,
      document_reviewed_at = v_now,
      document_reviewed_by = null,
      document_last_attempt_at = v_now,
      document_retry_available_at = null,
      document_last_failure_reason = null
    where id = v_user_id;

    return query
    select true, 'approved', true, null::timestamptz, null::text, false, 'Documento validado com sucesso.';
    return;
  end if;

  if p_result = 'pending' then
    update public.users
    set
      document_path = p_document_path,
      document_verified = null,
      document_review_status = 'pending',
      document_review_notes = null,
      document_reviewed_at = null,
      document_reviewed_by = null,
      document_last_attempt_at = v_now,
      document_retry_available_at = null,
      document_last_failure_reason = null
    where id = v_user_id;

    return query
    select true, 'pending', null::boolean, null::timestamptz, null::text, false, 'Documento enviado para analise manual.';
    return;
  end if;

  v_retry_until := v_now + interval '24 hours';

  update public.users
  set
    document_path = p_document_path,
    document_verified = false,
    document_review_status = 'rejected',
    document_review_notes = coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.'),
    document_reviewed_at = v_now,
    document_reviewed_by = null,
    document_last_attempt_at = v_now,
    document_retry_available_at = v_retry_until,
    document_last_failure_reason = coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.')
  where id = v_user_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link,
    is_read
  ) values (
    v_user_id,
    'account_verification',
    'Nao foi possivel validar seu documento',
    format(
      '%s Voce podera enviar uma nova tentativa apos %s.',
      coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.'),
      to_char(v_retry_until at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
    ),
    '/minha-conta/perfil',
    false
  );

  v_notification_created := true;

  return query
  select
    true,
    'rejected',
    false,
    v_retry_until,
    coalesce(v_failure_reason, 'Nao foi possivel validar o documento automaticamente.'),
    v_notification_created,
    'Documento reprovado automaticamente. Nova tentativa liberada em 24 horas.';
end;
$$;

grant execute on function public.complete_my_document_verification_upload(text, text, text) to authenticated;
