-- =====================================================================
-- NOTIFICAÇÃO DE INTERESSADOS VIA WHATSAPP (Cloud API)
-- Data: 2026-06-14
-- Espelha o padrão de e-mail (fila + worker) e o padrão Asaas
-- (config com segredo write-only via RPC admin-safe).
--
-- Componentes:
--   1) whatsapp_settings  -> config (token/phone_number_id/template) singleton
--   2) RPCs get/update _admin_safe (token nunca volta ao cliente)
--   3) whatsapp_notification_jobs -> fila (1 job por lead)
--   4) trigger on leads (insert) -> enfileira com telefone do vendedor
--
-- Idempotente. Rode tudo de uma vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Configuração (singleton, segredo sensível)
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_settings (
  id uuid primary key default gen_random_uuid(),
  access_token text,
  phone_number_id text,
  template_name text,
  template_lang text not null default 'pt_BR',
  is_enabled boolean not null default false,
  last_updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_settings_singleton check (id = '00000000-0000-0000-0000-000000000010')
);

comment on table public.whatsapp_settings is 'Configuração do WhatsApp Cloud API (token sensível, write-only via RPC).';

insert into public.whatsapp_settings (id, template_lang, is_enabled)
values ('00000000-0000-0000-0000-000000000010', 'pt_BR', false)
on conflict (id) do nothing;

create or replace function public.touch_whatsapp_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_whatsapp_settings_updated_at on public.whatsapp_settings;
create trigger trigger_touch_whatsapp_settings_updated_at
before update on public.whatsapp_settings
for each row execute function public.touch_whatsapp_updated_at();

alter table public.whatsapp_settings enable row level security;
-- Sem policies de acesso direto: leitura/escrita só pelos RPCs (SECURITY DEFINER)
-- e pelo worker (service_role, que ignora RLS).

-- ---------------------------------------------------------------------
-- 2) RPCs admin-safe (token nunca é devolvido ao cliente)
-- ---------------------------------------------------------------------
drop function if exists public.get_whatsapp_settings_admin_safe();
create or replace function public.get_whatsapp_settings_admin_safe()
returns table (
  id uuid,
  access_token_configured boolean,
  phone_number_id text,
  template_name text,
  template_lang text,
  is_enabled boolean,
  last_updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    s.id,
    coalesce(nullif(trim(s.access_token), '') is not null, false) as access_token_configured,
    s.phone_number_id,
    s.template_name,
    s.template_lang,
    s.is_enabled,
    s.last_updated_by,
    s.created_at,
    s.updated_at
  from public.whatsapp_settings s
  where s.id = '00000000-0000-0000-0000-000000000010';
end;
$$;

grant execute on function public.get_whatsapp_settings_admin_safe() to authenticated;

drop function if exists public.update_whatsapp_settings_admin_safe(text, text, text, text, boolean);
create or replace function public.update_whatsapp_settings_admin_safe(
  p_access_token text default null,
  p_phone_number_id text default null,
  p_template_name text default null,
  p_template_lang text default null,
  p_is_enabled boolean default null
)
returns table (
  id uuid,
  access_token_configured boolean,
  phone_number_id text,
  template_name text,
  template_lang text,
  is_enabled boolean,
  last_updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  update public.whatsapp_settings s
  set
    -- token: null/vazio mantém o atual (write-only, não apaga sem querer)
    access_token = case
      when p_access_token is null or trim(p_access_token) = '' then s.access_token
      else trim(p_access_token)
    end,
    phone_number_id = case
      when p_phone_number_id is null then s.phone_number_id
      else nullif(trim(p_phone_number_id), '')
    end,
    template_name = case
      when p_template_name is null then s.template_name
      else nullif(trim(p_template_name), '')
    end,
    template_lang = coalesce(nullif(trim(p_template_lang), ''), s.template_lang),
    is_enabled = coalesce(p_is_enabled, s.is_enabled),
    last_updated_by = v_user_id,
    updated_at = now()
  where s.id = '00000000-0000-0000-0000-000000000010';

  return query select * from public.get_whatsapp_settings_admin_safe();
end;
$$;

grant execute on function public.update_whatsapp_settings_admin_safe(text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Fila de jobs (1 por lead)
-- ---------------------------------------------------------------------
create table if not exists public.whatsapp_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  recipient_phone text,
  recipient_name text,
  buyer_name text,
  announcement_title text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  provider_message_id text,
  queued_at timestamptz not null default now(),
  processing_started_at timestamptz,
  last_attempt_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_whatsapp_jobs_lead_unique
  on public.whatsapp_notification_jobs (lead_id);
create index if not exists idx_whatsapp_jobs_status_queued
  on public.whatsapp_notification_jobs (status, queued_at desc);

drop trigger if exists trigger_touch_whatsapp_jobs_updated_at on public.whatsapp_notification_jobs;
create trigger trigger_touch_whatsapp_jobs_updated_at
before update on public.whatsapp_notification_jobs
for each row execute function public.touch_whatsapp_updated_at();

alter table public.whatsapp_notification_jobs enable row level security;

drop policy if exists "Admins manage whatsapp jobs" on public.whatsapp_notification_jobs;
create policy "Admins manage whatsapp jobs"
on public.whatsapp_notification_jobs
for all to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

-- ---------------------------------------------------------------------
-- 4) Trigger: enfileira no insert de lead
-- ---------------------------------------------------------------------
-- Normaliza telefone BR para dígitos com DDI 55 (formato aceito pela Cloud API).
create or replace function public.normalize_br_whatsapp_phone(p_raw text)
returns text language plpgsql immutable as $$
declare
  v_digits text;
begin
  v_digits := regexp_replace(coalesce(p_raw, ''), '\D', '', 'g');
  if v_digits = '' then
    return null;
  end if;
  -- já vem com 55 (12-13 dígitos): mantém
  if length(v_digits) in (12, 13) and left(v_digits, 2) = '55' then
    return v_digits;
  end if;
  -- DDD + número (10-11 dígitos): prefixa 55
  if length(v_digits) in (10, 11) then
    return '55' || v_digits;
  end if;
  -- formato inesperado: descarta (worker marca skipped)
  return null;
end;
$$;

create or replace function public.queue_whatsapp_lead_job()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_recipient_name text;
  v_recipient_phone text;
  v_announcement_title text;
  v_status text := 'pending';
  v_last_error text := null;
begin
  select
    coalesce(nullif(trim(u.name), ''), 'Vendedor'),
    public.normalize_br_whatsapp_phone(u.phone)
  into v_recipient_name, v_recipient_phone
  from public.users u
  where u.id = new.seller_id;

  select a.title into v_announcement_title
  from public.announcements a
  where a.id = new.announcement_id;

  if v_recipient_phone is null then
    v_status := 'skipped';
    v_last_error := 'Vendedor sem telefone valido para WhatsApp';
  end if;

  insert into public.whatsapp_notification_jobs (
    lead_id, recipient_user_id, recipient_phone, recipient_name,
    buyer_name, announcement_title, status, last_error
  )
  values (
    new.id,
    new.seller_id,
    v_recipient_phone,
    v_recipient_name,
    coalesce(nullif(trim(new.buyer_name), ''), split_part(coalesce(new.buyer_email, ''), '@', 1), 'Comprador'),
    coalesce(nullif(trim(v_announcement_title), ''), 'seu anuncio'),
    v_status,
    v_last_error
  )
  on conflict (lead_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_lead_queue_whatsapp on public.leads;
create trigger on_lead_queue_whatsapp
after insert on public.leads
for each row execute function public.queue_whatsapp_lead_job();

-- Verificação rápida:
-- select * from public.get_whatsapp_settings_admin_safe();
