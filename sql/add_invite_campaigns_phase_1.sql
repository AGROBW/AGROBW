create table if not exists public.invite_campaigns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  captor_name text not null,
  captor_email text null,
  notes text null,
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invite_visits (
  id uuid primary key default gen_random_uuid(),
  invite_campaign_id uuid not null references public.invite_campaigns(id) on delete cascade,
  session_id text not null,
  landing_path text not null default '/cadastro',
  registered_user_id uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invite_visits_campaign_session_unique unique (invite_campaign_id, session_id)
);

alter table public.users
  add column if not exists invite_campaign_id uuid null references public.invite_campaigns(id) on delete set null;

alter table public.users
  add column if not exists invite_code text null;

alter table public.users
  add column if not exists invite_attribution_at timestamptz null;

create index if not exists idx_invite_campaigns_status
  on public.invite_campaigns(status, created_at desc);

create index if not exists idx_invite_visits_campaign_id
  on public.invite_visits(invite_campaign_id, created_at desc);

create index if not exists idx_invite_visits_registered_user_id
  on public.invite_visits(registered_user_id);

create index if not exists idx_users_invite_campaign_id
  on public.users(invite_campaign_id, created_at desc);

comment on table public.invite_campaigns is
'Convites de captacao gerenciados pelo painel admin para rastrear visitas e cadastros por link.';

comment on table public.invite_visits is
'Visitas registradas por sessao em links de convite/captacao.';

comment on column public.users.invite_campaign_id is
'Convite/campanha responsavel pela atribuicao do cadastro.';

comment on column public.users.invite_code is
'Codigo do convite usado no momento do cadastro.';

comment on column public.users.invite_attribution_at is
'Instante em que o cadastro foi atribuido ao convite.';

create or replace function public.generate_invite_campaign_code(p_captor_name text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_base text;
  v_code text;
begin
  v_base := upper(regexp_replace(coalesce(p_captor_name, ''), '[^A-Za-z0-9]+', '', 'g'));
  v_base := nullif(v_base, '');

  if v_base is null then
    v_base := 'CAPTACAO';
  end if;

  v_base := left(v_base, 10);

  loop
    v_code := v_base || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (
      select 1
      from public.invite_campaigns ic
      where ic.code = v_code
    );
  end loop;

  return v_code;
end;
$$;

create or replace function public.touch_invite_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  if new.code is null or btrim(new.code) = '' then
    new.code := public.generate_invite_campaign_code(new.captor_name);
  else
    new.code := upper(trim(new.code));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_touch_invite_campaigns_updated_at on public.invite_campaigns;
create trigger trg_touch_invite_campaigns_updated_at
before insert or update on public.invite_campaigns
for each row
execute function public.touch_invite_campaigns_updated_at();

create or replace function public.touch_invite_visits_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_invite_visits_updated_at on public.invite_visits;
create trigger trg_touch_invite_visits_updated_at
before update on public.invite_visits
for each row
execute function public.touch_invite_visits_updated_at();

alter table public.invite_campaigns enable row level security;
alter table public.invite_visits enable row level security;

drop policy if exists "Admins manage invite campaigns" on public.invite_campaigns;
create policy "Admins manage invite campaigns"
on public.invite_campaigns
for all
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);

drop policy if exists "Admins view invite visits" on public.invite_visits;
create policy "Admins view invite visits"
on public.invite_visits
for select
to authenticated
using (public.is_admin() = true);

create or replace function public.resolve_public_invite_campaign(p_code text)
returns table (
  id uuid,
  code text,
  captor_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select ic.id, ic.code, ic.captor_name
  from public.invite_campaigns ic
  where ic.status = 'active'
    and ic.code = upper(trim(coalesce(p_code, '')))
  limit 1;
end;
$$;

grant execute on function public.resolve_public_invite_campaign(text) to anon, authenticated;

create or replace function public.register_invite_visit(
  p_code text,
  p_session_id text,
  p_landing_path text default '/cadastro'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_visit_id uuid;
begin
  if nullif(trim(coalesce(p_code, '')), '') is null or nullif(trim(coalesce(p_session_id, '')), '') is null then
    return null;
  end if;

  select ic.id
    into v_campaign_id
  from public.invite_campaigns ic
  where ic.status = 'active'
    and ic.code = upper(trim(p_code))
  limit 1;

  if v_campaign_id is null then
    return null;
  end if;

  insert into public.invite_visits (
    invite_campaign_id,
    session_id,
    landing_path
  ) values (
    v_campaign_id,
    trim(p_session_id),
    coalesce(nullif(trim(p_landing_path), ''), '/cadastro')
  )
  on conflict (invite_campaign_id, session_id)
  do update set
    landing_path = excluded.landing_path,
    updated_at = now()
  returning id into v_visit_id;

  return v_visit_id;
end;
$$;

grant execute on function public.register_invite_visit(text, text, text) to anon, authenticated;

create or replace function public.capture_signup_invite_attribution()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_meta jsonb;
  v_invite_code text;
  v_invite_session_id text;
  v_campaign_id uuid;
  v_campaign_code text;
begin
  select a.raw_user_meta_data
    into v_raw_meta
  from auth.users a
  where a.id = new.id;

  if v_raw_meta is null then
    return new;
  end if;

  v_invite_code := upper(trim(coalesce(v_raw_meta ->> 'invite_code', '')));
  v_invite_session_id := trim(coalesce(v_raw_meta ->> 'invite_session_id', ''));

  if v_invite_code = '' then
    return new;
  end if;

  select ic.id, ic.code
    into v_campaign_id, v_campaign_code
  from public.invite_campaigns ic
  where ic.status = 'active'
    and ic.code = v_invite_code
  limit 1;

  if v_campaign_id is null then
    return new;
  end if;

  update public.users
     set invite_campaign_id = v_campaign_id,
         invite_code = v_campaign_code,
         invite_attribution_at = coalesce(new.created_at, now())
   where id = new.id
     and invite_campaign_id is null;

  if v_invite_session_id is not null and v_invite_session_id <> '' then
    update public.invite_visits
       set registered_user_id = new.id,
           updated_at = now()
     where invite_campaign_id = v_campaign_id
       and session_id = v_invite_session_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_capture_signup_invite_attribution on public.users;
create trigger trg_capture_signup_invite_attribution
after insert on public.users
for each row
execute function public.capture_signup_invite_attribution();

create or replace function public.admin_list_invite_campaigns()
returns table (
  id uuid,
  code text,
  captor_name text,
  captor_email text,
  notes text,
  status text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  visits_count bigint,
  registrations_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Acesso negado.';
  end if;

  return query
  select
    ic.id,
    ic.code,
    ic.captor_name,
    ic.captor_email,
    ic.notes,
    ic.status,
    ic.created_by,
    ic.created_at,
    ic.updated_at,
    coalesce(iv.visits_count, 0) as visits_count,
    coalesce(u.registrations_count, 0) as registrations_count
  from public.invite_campaigns ic
  left join (
    select invite_campaign_id, count(*)::bigint as visits_count
    from public.invite_visits
    group by invite_campaign_id
  ) iv
    on iv.invite_campaign_id = ic.id
  left join (
    select invite_campaign_id, count(*)::bigint as registrations_count
    from public.users
    where invite_campaign_id is not null
    group by invite_campaign_id
  ) u
    on u.invite_campaign_id = ic.id
  order by ic.created_at desc;
end;
$$;

grant execute on function public.admin_list_invite_campaigns() to authenticated;
