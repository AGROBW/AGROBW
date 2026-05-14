create or replace function public.record_my_contact_legal_consents(
  p_user_agent text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_forwarded_for text;
  v_real_ip text;
  v_ip_text text;
  v_ip inet;
  v_terms_snapshot record;
  v_privacy_snapshot record;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio para registrar consentimentos de contato.';
  end if;

  v_forwarded_for := nullif(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), '');
  v_real_ip := nullif(v_headers ->> 'x-real-ip', '');
  v_ip_text := coalesce(v_forwarded_for, v_real_ip);

  if v_ip_text is not null then
    begin
      v_ip := trim(v_ip_text)::inet;
    exception
      when others then
        v_ip := null;
    end;
  end if;

  select *
    into v_terms_snapshot
  from public.resolve_legal_document_snapshot('terms_of_use');

  insert into public.user_legal_consents (
    user_id,
    consent_type,
    document_version,
    document_title,
    document_url,
    accepted_at,
    source,
    user_agent,
    ip_address,
    metadata
  ) values (
    v_user_id,
    'terms_of_use',
    v_terms_snapshot.document_version,
    v_terms_snapshot.document_title,
    v_terms_snapshot.document_url,
    now(),
    'contact_modal',
    p_user_agent,
    v_ip,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('captured_from', 'contact_modal')
  )
  on conflict do nothing;

  select *
    into v_privacy_snapshot
  from public.resolve_legal_document_snapshot('privacy_policy');

  insert into public.user_legal_consents (
    user_id,
    consent_type,
    document_version,
    document_title,
    document_url,
    accepted_at,
    source,
    user_agent,
    ip_address,
    metadata
  ) values (
    v_user_id,
    'privacy_policy',
    v_privacy_snapshot.document_version,
    v_privacy_snapshot.document_title,
    v_privacy_snapshot.document_url,
    now(),
    'contact_modal',
    p_user_agent,
    v_ip,
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('captured_from', 'contact_modal')
  )
  on conflict do nothing;
end;
$$;

grant execute on function public.record_my_contact_legal_consents(text, jsonb) to authenticated;

comment on function public.record_my_contact_legal_consents(text, jsonb) is
'Registra, com IP e user-agent derivados da requisicao, o aceite de Termos e Privacidade ao iniciar contato com vendedor.';
