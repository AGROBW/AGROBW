create or replace function public.list_my_pending_legal_consents()
returns table (
  consent_type text,
  document_version text,
  document_title text,
  document_url text,
  accepted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio para consultar pendencias de reaceite.';
  end if;

  return query
  with latest_documents as (
    select *
    from public.resolve_legal_document_snapshot('terms_of_use')
    union all
    select *
    from public.resolve_legal_document_snapshot('privacy_policy')
  ),
  normalized_latest as (
    select
      case
        when ld.document_title = 'Termos de Uso' then 'terms_of_use'
        when ld.document_title = 'Política de Privacidade' then 'privacy_policy'
        else lower(replace(ld.document_title, ' ', '_'))
      end as consent_type,
      ld.document_version,
      ld.document_title,
      ld.document_url
    from latest_documents ld
  ),
  latest_acceptances as (
    select distinct on (ulc.consent_type)
      ulc.consent_type,
      ulc.document_version,
      ulc.accepted_at
    from public.user_legal_consents ulc
    where ulc.user_id = v_user_id
      and ulc.revoked_at is null
      and ulc.consent_type in ('terms_of_use', 'privacy_policy')
    order by ulc.consent_type, ulc.accepted_at desc
  )
  select
    nl.consent_type,
    nl.document_version,
    nl.document_title,
    nl.document_url,
    la.accepted_at
  from normalized_latest nl
  left join latest_acceptances la
    on la.consent_type = nl.consent_type
   and la.document_version = nl.document_version
  where la.accepted_at is null
  order by nl.consent_type;
end;
$$;

grant execute on function public.list_my_pending_legal_consents() to authenticated;

create or replace function public.accept_my_pending_legal_consents(
  p_user_agent text default null
)
returns integer
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
  v_row record;
  v_inserted_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario autenticado obrigatorio para registrar reaceite.';
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

  for v_row in
    select *
    from public.list_my_pending_legal_consents()
  loop
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
      v_row.consent_type,
      v_row.document_version,
      v_row.document_title,
      v_row.document_url,
      now(),
      'profile',
      p_user_agent,
      v_ip,
      jsonb_build_object('captured_from', 'reaccept_gate')
    )
    on conflict do nothing;

    if found then
      v_inserted_count := v_inserted_count + 1;
    end if;
  end loop;

  return v_inserted_count;
end;
$$;

grant execute on function public.accept_my_pending_legal_consents(text) to authenticated;

comment on function public.list_my_pending_legal_consents() is
'Lista os documentos legais atuais que o usuario autenticado ainda precisa reaceitar.';

comment on function public.accept_my_pending_legal_consents(text) is
'Registra o reaceite das versoes atuais de Termos e Privacidade para o usuario autenticado.';
