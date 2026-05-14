create or replace function public.admin_export_user_legal_consents(
  p_search text default null,
  p_consent_type text default null,
  p_source text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
)
returns table (
  user_name text,
  user_email text,
  user_document text,
  consent_type text,
  document_version text,
  document_title text,
  document_url text,
  accepted_at timestamptz,
  revoked_at timestamptz,
  source text,
  ip_address text,
  user_agent text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_search text := nullif(trim(p_search), '');
begin
  if not exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  ) then
    raise exception 'Acesso negado';
  end if;

  return query
  select
    u.name as user_name,
    u.email as user_email,
    u.document as user_document,
    ulc.consent_type,
    ulc.document_version,
    ulc.document_title,
    ulc.document_url,
    ulc.accepted_at,
    ulc.revoked_at,
    ulc.source,
    ulc.ip_address::text as ip_address,
    ulc.user_agent,
    ulc.metadata
  from public.user_legal_consents ulc
  join public.users u on u.id = ulc.user_id
  where (
    p_consent_type is null
    or trim(p_consent_type) = ''
    or ulc.consent_type = p_consent_type
  )
    and (
      p_source is null
      or trim(p_source) = ''
      or ulc.source = p_source
    )
    and (p_date_from is null or ulc.accepted_at >= p_date_from)
    and (p_date_to is null or ulc.accepted_at <= p_date_to)
    and (
      v_search is null
      or u.name ilike '%' || v_search || '%'
      or u.email ilike '%' || v_search || '%'
      or coalesce(u.document, '') ilike '%' || v_search || '%'
      or ulc.document_version ilike '%' || v_search || '%'
      or ulc.document_title ilike '%' || v_search || '%'
    )
  order by ulc.accepted_at desc;
end;
$$;

grant execute on function public.admin_export_user_legal_consents(text, text, text, timestamptz, timestamptz) to authenticated;

comment on function public.admin_export_user_legal_consents(text, text, text, timestamptz, timestamptz) is
'Exporta os consentimentos legais filtrados para uso administrativo e jurídico.';
