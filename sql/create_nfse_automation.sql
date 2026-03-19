create table if not exists public.fiscal_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'FOCUSNFE' check (provider in ('FOCUSNFE')),
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  auto_issue_enabled boolean not null default false,
  legal_name text not null default '',
  trade_name text,
  cnpj text not null default '',
  municipal_registration text,
  tax_regime text,
  service_code text,
  service_description text,
  service_city_code text,
  cnae_code text,
  issuer_email text,
  provider_api_base_url text not null default 'https://homologacao.focusnfe.com.br',
  provider_company_id text,
  provider_invoice_endpoint_path text not null default '/v2/nfse?ref={reference}',
  provider_webhook_secret text,
  invoice_series text,
  next_rps_number bigint,
  focus_nfse_reference_prefix text not null default 'BWAGRO',
  focus_natureza_operacao text not null default '1',
  focus_special_tax_regime text,
  focus_simple_national boolean not null default false,
  focus_service_list_item text,
  focus_municipal_tax_code text,
  focus_iss_withheld boolean not null default false,
  focus_iss_taxation_type text,
  focus_iss_rate numeric(6,4),
  additional_information text,
  last_updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fiscal_settings
  add column if not exists provider text,
  add column if not exists environment text,
  add column if not exists auto_issue_enabled boolean,
  add column if not exists legal_name text,
  add column if not exists trade_name text,
  add column if not exists cnpj text,
  add column if not exists municipal_registration text,
  add column if not exists tax_regime text,
  add column if not exists service_code text,
  add column if not exists service_description text,
  add column if not exists service_city_code text,
  add column if not exists cnae_code text,
  add column if not exists issuer_email text,
  add column if not exists provider_api_base_url text,
  add column if not exists provider_company_id text,
  add column if not exists provider_invoice_endpoint_path text,
  add column if not exists provider_webhook_secret text,
  add column if not exists invoice_series text,
  add column if not exists next_rps_number bigint,
  add column if not exists focus_nfse_reference_prefix text,
  add column if not exists focus_natureza_operacao text,
  add column if not exists focus_special_tax_regime text,
  add column if not exists focus_simple_national boolean,
  add column if not exists focus_service_list_item text,
  add column if not exists focus_municipal_tax_code text,
  add column if not exists focus_iss_withheld boolean,
  add column if not exists focus_iss_taxation_type text,
  add column if not exists focus_iss_rate numeric(6,4),
  add column if not exists additional_information text,
  add column if not exists last_updated_by uuid,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

alter table public.fiscal_settings
  alter column provider set default 'FOCUSNFE',
  alter column environment set default 'sandbox',
  alter column auto_issue_enabled set default false,
  alter column legal_name set default '',
  alter column cnpj set default '',
  alter column provider_api_base_url set default 'https://homologacao.focusnfe.com.br',
  alter column provider_invoice_endpoint_path set default '/v2/nfse?ref={reference}',
  alter column focus_nfse_reference_prefix set default 'BWAGRO',
  alter column focus_natureza_operacao set default '1',
  alter column focus_simple_national set default false,
  alter column focus_iss_withheld set default false,
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.fiscal_settings
set
  provider = coalesce(provider, 'FOCUSNFE'),
  environment = coalesce(environment, 'sandbox'),
  auto_issue_enabled = coalesce(auto_issue_enabled, false),
  legal_name = coalesce(legal_name, ''),
  cnpj = coalesce(cnpj, ''),
  provider_api_base_url = coalesce(provider_api_base_url, 'https://homologacao.focusnfe.com.br'),
  provider_invoice_endpoint_path = coalesce(provider_invoice_endpoint_path, '/v2/nfse?ref={reference}'),
  focus_nfse_reference_prefix = coalesce(focus_nfse_reference_prefix, 'BWAGRO'),
  focus_natureza_operacao = coalesce(focus_natureza_operacao, '1'),
  focus_simple_national = coalesce(focus_simple_national, false),
  focus_iss_withheld = coalesce(focus_iss_withheld, false),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now());

create unique index if not exists idx_fiscal_settings_singleton
  on public.fiscal_settings ((true));

alter table public.fiscal_settings enable row level security;

drop policy if exists "Admins can read fiscal settings" on public.fiscal_settings;
create policy "Admins can read fiscal settings"
  on public.fiscal_settings
  for select
  to authenticated
  using (public.is_admin() = true);

drop policy if exists "Admins can insert fiscal settings" on public.fiscal_settings;
create policy "Admins can insert fiscal settings"
  on public.fiscal_settings
  for insert
  to authenticated
  with check (public.is_admin() = true);

drop policy if exists "Admins can update fiscal settings" on public.fiscal_settings;
create policy "Admins can update fiscal settings"
  on public.fiscal_settings
  for update
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

insert into public.fiscal_settings (
  provider,
  environment,
  auto_issue_enabled,
  legal_name,
  cnpj,
  provider_api_base_url,
  provider_invoice_endpoint_path
)
select
  'FOCUSNFE',
  'sandbox',
  false,
  '',
  '',
  'https://homologacao.focusnfe.com.br',
  '/v2/nfse?ref={reference}'
where not exists (
  select 1 from public.fiscal_settings
);

alter table public.payments
  add column if not exists fiscal_provider text,
  add column if not exists fiscal_external_id text,
  add column if not exists fiscal_status text not null default 'not_requested'
    check (fiscal_status in ('not_requested', 'queued', 'processing', 'issued', 'failed', 'manual')),
  add column if not exists fiscal_last_attempt_at timestamptz,
  add column if not exists fiscal_error_message text,
  add column if not exists invoice_xml_url text,
  add column if not exists invoice_xml_storage_path text;

create table if not exists public.fiscal_document_jobs (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments(id) on delete cascade,
  provider text not null default 'FOCUSNFE',
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'awaiting_webhook', 'completed', 'failed', 'cancelled')),
  attempts integer not null default 0,
  provider_request_id text,
  provider_document_id text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  last_error text,
  requested_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fiscal_document_jobs_status
  on public.fiscal_document_jobs(status, created_at desc);

alter table public.fiscal_document_jobs enable row level security;

drop policy if exists "Admins can read fiscal jobs" on public.fiscal_document_jobs;
create policy "Admins can read fiscal jobs"
  on public.fiscal_document_jobs
  for select
  to authenticated
  using (public.is_admin() = true);

drop policy if exists "Admins can update fiscal jobs" on public.fiscal_document_jobs;
create policy "Admins can update fiscal jobs"
  on public.fiscal_document_jobs
  for update
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Service role can manage fiscal jobs" on public.fiscal_document_jobs;
create policy "Service role can manage fiscal jobs"
  on public.fiscal_document_jobs
  for all
  to service_role
  using (true)
  with check (true);

comment on table public.fiscal_settings is 'Configuracao operacional e tributaria para emissao automatica de NFS-e';
comment on table public.fiscal_document_jobs is 'Fila e auditoria da automacao de emissao fiscal';
comment on column public.payments.fiscal_status is 'Status interno da automacao fiscal do pagamento';
comment on column public.fiscal_settings.focus_nfse_reference_prefix is 'Prefixo usado para gerar a referencia unica enviada ao Focus NFe';
comment on column public.fiscal_settings.focus_natureza_operacao is 'Campo natureza_operacao da NFSe Focus';
comment on column public.fiscal_settings.focus_special_tax_regime is 'Campo regime_especial_tributacao da NFSe Focus';
comment on column public.fiscal_settings.focus_simple_national is 'Indica se o prestador e optante pelo Simples Nacional';
comment on column public.fiscal_settings.focus_service_list_item is 'Campo item_lista_servico da NFSe Focus';
comment on column public.fiscal_settings.focus_municipal_tax_code is 'Campo codigo_tributario_municipio da NFSe Focus';
