create table if not exists public.user_legal_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  consent_type text not null,
  document_version text not null,
  document_title text not null,
  document_url text not null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  source text not null default 'register',
  user_agent text,
  ip_address inet,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint user_legal_consents_type_check check (
    consent_type in ('terms_of_use', 'privacy_policy', 'marketing_opt_in', 'contact_terms')
  ),
  constraint user_legal_consents_source_check check (
    source in ('register', 'contact_modal', 'profile', 'admin')
  )
);

comment on table public.user_legal_consents is
'Histórico jurídico de consentimentos e aceite de documentos legais do usuário.';

comment on column public.user_legal_consents.document_version is
'Versão resolvida do documento legal no momento do aceite.';

create index if not exists idx_user_legal_consents_user_id
  on public.user_legal_consents (user_id, accepted_at desc);

create unique index if not exists idx_user_legal_consents_unique_acceptance
  on public.user_legal_consents (user_id, consent_type, document_version, source)
  where revoked_at is null;

alter table public.user_legal_consents enable row level security;

drop policy if exists "Users can view own legal consents" on public.user_legal_consents;
create policy "Users can view own legal consents"
on public.user_legal_consents
for select
to authenticated
using (auth.uid() = user_id or public.is_admin() = true);

drop policy if exists "Admins can manage legal consents" on public.user_legal_consents;
create policy "Admins can manage legal consents"
on public.user_legal_consents
for all
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

create or replace function public.resolve_legal_document_snapshot(p_consent_type text)
returns table (
  document_version text,
  document_title text,
  document_url text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms_updated_at timestamptz;
  v_privacy_updated_at timestamptz;
begin
  if p_consent_type = 'terms_of_use' then
    select updated_at
      into v_terms_updated_at
    from public.terms_page_content
    limit 1;

    return query
    select
      'terms-of-use:' || coalesce(to_char(v_terms_updated_at at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'initial'),
      'Termos de Uso'::text,
      '/termos-de-uso'::text;
    return;
  end if;

  if p_consent_type = 'privacy_policy' then
    select updated_at
      into v_privacy_updated_at
    from public.privacy_page_content
    limit 1;

    return query
    select
      'privacy-policy:' || coalesce(to_char(v_privacy_updated_at at time zone 'UTC', 'YYYYMMDDHH24MISS'), 'initial'),
      'Política de Privacidade'::text,
      '/privacidade'::text;
    return;
  end if;

  raise exception 'Consent type nao suportado para snapshot juridico: %', p_consent_type;
end;
$$;

grant execute on function public.resolve_legal_document_snapshot(text) to authenticated;

create or replace function public.capture_signup_legal_consents()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_meta jsonb;
  v_accepted_terms boolean := false;
  v_accepted_privacy boolean := false;
  v_user_agent text;
  v_source text := 'register';
  v_terms_snapshot record;
  v_privacy_snapshot record;
begin
  select a.raw_user_meta_data
    into v_raw_meta
  from auth.users a
  where a.id = new.id;

  if v_raw_meta is null then
    return new;
  end if;

  v_accepted_terms := coalesce((v_raw_meta ->> 'accepted_terms_of_use')::boolean, false);
  v_accepted_privacy := coalesce((v_raw_meta ->> 'accepted_privacy_policy')::boolean, false);
  v_user_agent := nullif(v_raw_meta ->> 'legal_consent_user_agent', '');
  v_source := coalesce(nullif(v_raw_meta ->> 'legal_consent_source', ''), 'register');

  if v_accepted_terms then
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
      metadata
    ) values (
      new.id,
      'terms_of_use',
      v_terms_snapshot.document_version,
      v_terms_snapshot.document_title,
      v_terms_snapshot.document_url,
      coalesce(new.created_at, now()),
      v_source,
      v_user_agent,
      jsonb_build_object('captured_from', 'signup')
    )
    on conflict do nothing;
  end if;

  if v_accepted_privacy then
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
      metadata
    ) values (
      new.id,
      'privacy_policy',
      v_privacy_snapshot.document_version,
      v_privacy_snapshot.document_title,
      v_privacy_snapshot.document_url,
      coalesce(new.created_at, now()),
      v_source,
      v_user_agent,
      jsonb_build_object('captured_from', 'signup')
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capture_signup_legal_consents on public.users;
create trigger trg_capture_signup_legal_consents
after insert on public.users
for each row execute procedure public.capture_signup_legal_consents();

comment on function public.capture_signup_legal_consents() is
'Captura os aceites jurídicos informados no cadastro inicial e os transforma em histórico auditável.';
