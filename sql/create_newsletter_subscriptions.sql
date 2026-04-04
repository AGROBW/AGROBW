create table if not exists public.newsletter_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  normalized_email text not null unique,
  source text not null default 'footer',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_newsletter_subscriptions_status
  on public.newsletter_subscriptions (status);

alter table public.newsletter_subscriptions enable row level security;

drop policy if exists "Admins can manage newsletter subscriptions" on public.newsletter_subscriptions;
create policy "Admins can manage newsletter subscriptions"
on public.newsletter_subscriptions
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

create or replace function public.subscribe_newsletter(
  p_email text,
  p_source text default 'footer'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_normalized_email text;
begin
  v_email := trim(coalesce(p_email, ''));

  if v_email = '' then
    raise exception 'E-mail obrigatório';
  end if;

  if length(v_email) > 254 then
    raise exception 'E-mail inválido';
  end if;

  if v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'E-mail inválido';
  end if;

  v_normalized_email := lower(v_email);

  insert into public.newsletter_subscriptions (
    email,
    normalized_email,
    source,
    status
  )
  values (
    v_email,
    v_normalized_email,
    coalesce(nullif(trim(p_source), ''), 'footer'),
    'active'
  )
  on conflict (normalized_email) do nothing;

  if found then
    return 'created';
  end if;

  update public.newsletter_subscriptions
  set
    email = v_email,
    source = coalesce(nullif(trim(p_source), ''), 'footer'),
    status = 'active',
    updated_at = now()
  where normalized_email = v_normalized_email;

  return 'existing';
end;
$$;

revoke all on public.newsletter_subscriptions from anon, authenticated;
grant execute on function public.subscribe_newsletter(text, text) to anon, authenticated;

create or replace function public.admin_list_newsletter_subscriptions(
  p_search text default null,
  p_status text default null,
  p_page integer default 0,
  p_page_size integer default 20
)
returns table (
  id uuid,
  email text,
  source text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offset integer := greatest(coalesce(p_page, 0), 0) * greatest(coalesce(p_page_size, 20), 1);
  v_limit integer := greatest(coalesce(p_page_size, 20), 1);
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
    select ns.*
    from public.newsletter_subscriptions ns
    where (p_status is null or ns.status = p_status)
      and (
        p_search is null
        or trim(p_search) = ''
        or ns.email ilike '%' || trim(p_search) || '%'
      )
  )
  select
    filtered.id,
    filtered.email,
    filtered.source,
    filtered.status,
    filtered.created_at,
    filtered.updated_at,
    count(*) over() as total_count
  from filtered
  order by filtered.created_at desc
  offset v_offset
  limit v_limit;
end;
$$;

grant execute on function public.admin_list_newsletter_subscriptions(text, text, integer, integer) to authenticated;

create or replace function public.admin_export_newsletter_subscriptions(
  p_search text default null,
  p_status text default null
)
returns table (
  email text,
  source text,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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
    ns.email,
    ns.source,
    ns.status,
    ns.created_at,
    ns.updated_at
  from public.newsletter_subscriptions ns
  where (p_status is null or ns.status = p_status)
    and (
      p_search is null
      or trim(p_search) = ''
      or ns.email ilike '%' || trim(p_search) || '%'
    )
  order by ns.created_at desc;
end;
$$;

grant execute on function public.admin_export_newsletter_subscriptions(text, text) to authenticated;
