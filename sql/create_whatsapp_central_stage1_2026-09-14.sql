begin;

set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() nao existe. Aplique primeiro o hardening administrativo com MFA.';
  end if;
end;
$$;

create or replace function public.is_safe_whatsapp_gateway_base_url(p_url text)
returns boolean
language plpgsql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_url text := lower(trim(coalesce(p_url, '')));
  v_authority text;
  v_host text;
  v_port text;
begin
  if v_url = '' then
    return false;
  end if;

  -- A base deve conter somente esquema e autoridade. Caminhos ficam em colunas separadas.
  if v_url !~ '^https://[a-z0-9][a-z0-9.-]*\.[a-z0-9-]{2,63}(:[0-9]{1,5})?$' then
    return false;
  end if;

  v_authority := substring(v_url from 9);
  v_host := split_part(v_authority, ':', 1);
  v_port := nullif(split_part(v_authority, ':', 2), '');

  if v_port is not null and (v_port::integer < 1 or v_port::integer > 65535) then
    return false;
  end if;

  if v_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$'
    or v_host in ('localhost', 'localhost.localdomain')
    or v_host like '%.localhost'
    or v_host like '%.local'
    or v_host like '%.internal'
    or v_host like '127.%'
    or v_host like '10.%'
    or v_host like '192.168.%'
    or v_host like '169.254.%'
    or v_host ~ '^172\.(1[6-9]|2[0-9]|3[01])\.'
    or v_host like '0.%' then
    return false;
  end if;

  return true;
end;
$$;

create table if not exists public.whatsapp_gateway_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'external_gateway',
  base_url text,
  send_path text not null default '/api/v1/messages',
  health_path text not null default '/api/v1/health',
  auth_type text not null default 'bearer',
  auth_secret text,
  default_recipient_phone text,
  is_enabled boolean not null default false,
  last_updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint whatsapp_gateway_settings_singleton
    check (id = '00000000-0000-0000-0000-000000000020'),
  constraint whatsapp_gateway_settings_provider
    check (provider = 'external_gateway'),
  constraint whatsapp_gateway_settings_auth_type
    check (auth_type in ('bearer', 'hmac_sha256')),
  constraint whatsapp_gateway_settings_base_url
    check (base_url is null or public.is_safe_whatsapp_gateway_base_url(base_url)),
  constraint whatsapp_gateway_settings_send_path
    check (send_path ~ '^/[A-Za-z0-9/_-]*$' and position('//' in send_path) = 0),
  constraint whatsapp_gateway_settings_health_path
    check (health_path ~ '^/[A-Za-z0-9/_-]*$' and position('//' in health_path) = 0),
  constraint whatsapp_gateway_settings_phone
    check (default_recipient_phone is null or default_recipient_phone ~ '^[1-9][0-9]{9,14}$')
);

comment on table public.whatsapp_gateway_settings is
  'Configuracao singleton do gateway externo da Central WhatsApp. O segredo nunca e retornado aos clientes.';
comment on column public.whatsapp_gateway_settings.auth_secret is
  'Credencial write-only utilizada exclusivamente por workers server-side.';

insert into public.whatsapp_gateway_settings (
  id,
  provider,
  send_path,
  health_path,
  auth_type,
  is_enabled
)
values (
  '00000000-0000-0000-0000-000000000020',
  'external_gateway',
  '/api/v1/messages',
  '/api/v1/health',
  'bearer',
  false
)
on conflict (id) do nothing;

create or replace function public.touch_whatsapp_gateway_settings_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_whatsapp_gateway_settings_updated_at
  on public.whatsapp_gateway_settings;
create trigger trigger_touch_whatsapp_gateway_settings_updated_at
before update on public.whatsapp_gateway_settings
for each row
execute function public.touch_whatsapp_gateway_settings_updated_at();

alter table public.whatsapp_gateway_settings enable row level security;
alter table public.whatsapp_gateway_settings force row level security;

revoke all on table public.whatsapp_gateway_settings from public, anon, authenticated;
grant select on table public.whatsapp_gateway_settings to service_role;

drop function if exists public.get_whatsapp_gateway_settings_admin_safe();
create or replace function public.get_whatsapp_gateway_settings_admin_safe()
returns table (
  id uuid,
  provider text,
  base_url text,
  send_path text,
  health_path text,
  auth_type text,
  auth_secret_configured boolean,
  default_recipient_phone text,
  is_enabled boolean,
  last_updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  return query
  select
    settings.id,
    settings.provider,
    settings.base_url,
    settings.send_path,
    settings.health_path,
    settings.auth_type,
    coalesce(nullif(trim(settings.auth_secret), '') is not null, false),
    settings.default_recipient_phone,
    settings.is_enabled,
    settings.last_updated_by,
    settings.created_at,
    settings.updated_at
  from public.whatsapp_gateway_settings settings
  where settings.id = '00000000-0000-0000-0000-000000000020';
end;
$$;

drop function if exists public.update_whatsapp_gateway_settings_admin_safe(text, text, text, text, text, text, boolean);
create or replace function public.update_whatsapp_gateway_settings_admin_safe(
  p_base_url text default null,
  p_send_path text default null,
  p_health_path text default null,
  p_auth_type text default null,
  p_auth_secret text default null,
  p_default_recipient_phone text default null,
  p_is_enabled boolean default null
)
returns table (
  id uuid,
  provider text,
  base_url text,
  send_path text,
  health_path text,
  auth_type text,
  auth_secret_configured boolean,
  default_recipient_phone text,
  is_enabled boolean,
  last_updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.whatsapp_gateway_settings%rowtype;
  v_base_url text;
  v_send_path text;
  v_health_path text;
  v_auth_type text;
  v_auth_secret text;
  v_phone text;
  v_is_enabled boolean;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Unauthorized' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.whatsapp_gateway_settings settings
  where settings.id = '00000000-0000-0000-0000-000000000020'
  for update;

  if not found then
    raise exception 'Configuracao da Central WhatsApp nao encontrada';
  end if;

  v_base_url := case
    when p_base_url is null then v_current.base_url
    else nullif(regexp_replace(trim(p_base_url), '/+$', ''), '')
  end;
  v_send_path := coalesce(nullif(trim(p_send_path), ''), v_current.send_path);
  v_health_path := coalesce(nullif(trim(p_health_path), ''), v_current.health_path);
  v_auth_type := coalesce(nullif(trim(p_auth_type), ''), v_current.auth_type);
  v_auth_secret := case
    when p_auth_secret is null or trim(p_auth_secret) = '' then v_current.auth_secret
    else trim(p_auth_secret)
  end;
  v_phone := case
    when p_default_recipient_phone is null then v_current.default_recipient_phone
    else nullif(regexp_replace(p_default_recipient_phone, '\D', '', 'g'), '')
  end;
  v_is_enabled := coalesce(p_is_enabled, v_current.is_enabled);

  if v_base_url is not null and not public.is_safe_whatsapp_gateway_base_url(v_base_url) then
    raise exception 'A URL do gateway deve ser HTTPS publica e conter apenas o dominio' using errcode = '22023';
  end if;
  if v_send_path !~ '^/[A-Za-z0-9/_-]*$' or position('//' in v_send_path) > 0 then
    raise exception 'Endpoint de envio invalido' using errcode = '22023';
  end if;
  if v_health_path !~ '^/[A-Za-z0-9/_-]*$' or position('//' in v_health_path) > 0 then
    raise exception 'Endpoint de saude invalido' using errcode = '22023';
  end if;
  if v_auth_type not in ('bearer', 'hmac_sha256') then
    raise exception 'Tipo de autenticacao invalido' using errcode = '22023';
  end if;
  if v_phone is not null and v_phone !~ '^[1-9][0-9]{9,14}$' then
    raise exception 'Numero de WhatsApp invalido' using errcode = '22023';
  end if;
  if v_is_enabled and (
    v_base_url is null
    or v_phone is null
    or nullif(trim(coalesce(v_auth_secret, '')), '') is null
  ) then
    raise exception 'Preencha URL, credencial e numero de destino antes de ativar o gateway' using errcode = '22023';
  end if;

  update public.whatsapp_gateway_settings settings
  set
    base_url = v_base_url,
    send_path = v_send_path,
    health_path = v_health_path,
    auth_type = v_auth_type,
    auth_secret = v_auth_secret,
    default_recipient_phone = v_phone,
    is_enabled = v_is_enabled,
    last_updated_by = auth.uid()
  where settings.id = v_current.id;

  return query
  select * from public.get_whatsapp_gateway_settings_admin_safe();
end;
$$;

revoke all on function public.is_safe_whatsapp_gateway_base_url(text)
  from public, anon, authenticated;
revoke all on function public.touch_whatsapp_gateway_settings_updated_at()
  from public, anon, authenticated;
revoke all on function public.get_whatsapp_gateway_settings_admin_safe()
  from public, anon, authenticated;
revoke all on function public.update_whatsapp_gateway_settings_admin_safe(text, text, text, text, text, text, boolean)
  from public, anon, authenticated;

grant execute on function public.get_whatsapp_gateway_settings_admin_safe()
  to authenticated;
grant execute on function public.update_whatsapp_gateway_settings_admin_safe(text, text, text, text, text, text, boolean)
  to authenticated;

commit;
