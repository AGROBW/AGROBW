-- =====================================================================
-- FIX — admin_list_user_legal_consents: 42804 "structure of query does not match
--       function result type" (coluna 5 user_document: varchar(20) vs text)
-- Data: 2026-06-10
-- =====================================================================
-- CAUSA: RETURNS TABLE define user_document text, mas no corpo a query devolve
-- `u.document as user_document` e no vivo users.document é varchar(20) ->
-- incompatibilidade de tipo (42804) -> PostgREST devolve 400.
-- FIX MÍNIMO: cast explícito -> `u.document::text as user_document`.
-- Nada mais muda. CREATE OR REPLACE preserva grants existentes.
--
-- ⚠️ Corpo capturado do dump (2026-06-07). Conferir vs vivo antes de aplicar:
--   select pg_get_functiondef('public.admin_list_user_legal_consents(text,text,text,timestamptz,timestamptz,integer,integer)'::regprocedure);
--   Se divergir, aplicar APENAS a troca: u.document as user_document -> u.document::text as user_document
-- =====================================================================

create or replace function public.admin_list_user_legal_consents(
  p_search text default null,
  p_consent_type text default null,
  p_source text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_page integer default 0,
  p_page_size integer default 20
)
returns table(
  id uuid, user_id uuid, user_name text, user_email text, user_document text,
  consent_type text, document_version text, document_title text, document_url text,
  accepted_at timestamptz, revoked_at timestamptz, source text, user_agent text,
  ip_address text, metadata jsonb, total_count bigint
)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
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
  with filtered as (
    select
      ulc.id,
      ulc.user_id,
      u.name as user_name,
      u.email as user_email,
      u.document::text as user_document,      -- FIX 42804: cast varchar(20) -> text
      ulc.consent_type,
      ulc.document_version,
      ulc.document_title,
      ulc.document_url,
      ulc.accepted_at,
      ulc.revoked_at,
      ulc.source,
      ulc.user_agent,
      ulc.ip_address::text as ip_address,
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
  )
  select
    filtered.id,
    filtered.user_id,
    filtered.user_name,
    filtered.user_email,
    filtered.user_document,
    filtered.consent_type,
    filtered.document_version,
    filtered.document_title,
    filtered.document_url,
    filtered.accepted_at,
    filtered.revoked_at,
    filtered.source,
    filtered.user_agent,
    filtered.ip_address,
    filtered.metadata,
    count(*) over() as total_count
  from filtered
  order by filtered.accepted_at desc
  offset v_offset
  limit v_limit;
end;
$$;

-- =====================================================================
-- VALIDAÇÃO:
--   admin: painel LegalConsentsManagement carrega via RPC (sem cair no fallback);
--     busca/filtros/paginação funcionam; user_document aparece.
--   não-admin/anon: 'Acesso negado'.
--   select * from public.admin_list_user_legal_consents() limit 1;  (admin) -> retorna sem 42804.
-- ROLLBACK: re-aplicar a versão anterior (sem o cast) — reintroduz o bug.
-- =====================================================================
