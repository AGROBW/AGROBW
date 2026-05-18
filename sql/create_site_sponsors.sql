create table if not exists public.site_sponsors (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text null,
  email text null,
  phone text null,
  segment text not null,
  logo_url text null,
  banner_url text null,
  target_type text not null default 'site'
    check (target_type in ('site', 'whatsapp')),
  target_url text null,
  slot_position integer null
    check (slot_position between 1 and 6),
  status text not null default 'active'
    check (status in ('active', 'paused', 'expired')),
  starts_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  ends_on date null,
  notes text null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_site_sponsors_status on public.site_sponsors(status);
create index if not exists idx_site_sponsors_period on public.site_sponsors(starts_on, ends_on);
create index if not exists idx_site_sponsors_slot_position on public.site_sponsors(slot_position);
create unique index if not exists idx_site_sponsors_active_slot_unique
  on public.site_sponsors(slot_position)
  where status = 'active' and slot_position is not null;

create or replace function public.is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (
        coalesce(u.is_admin, false) = true
        or u.role = 'admin'
      )
  );
$$;

create or replace function public.touch_site_sponsors_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_touch_site_sponsors_updated_at on public.site_sponsors;
create trigger trg_touch_site_sponsors_updated_at
before insert or update on public.site_sponsors
for each row
execute function public.touch_site_sponsors_updated_at();

create or replace function public.validate_site_sponsor_capacity()
returns trigger
language plpgsql
as $$
declare
  v_active_count integer := 0;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if new.status = 'active'
     and new.starts_on <= v_today
     and (new.ends_on is null or new.ends_on >= v_today) then
    select count(*)
      into v_active_count
    from public.site_sponsors s
    where s.status = 'active'
      and s.starts_on <= v_today
      and (s.ends_on is null or s.ends_on >= v_today)
      and s.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

    if v_active_count >= 6 then
      raise exception 'Limite de 6 patrocinadores ativos atingido.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_site_sponsor_capacity on public.site_sponsors;
create trigger trg_validate_site_sponsor_capacity
before insert or update on public.site_sponsors
for each row
execute function public.validate_site_sponsor_capacity();

create or replace function public.get_public_sponsor_landing_stats()
returns table (
  total_slots integer,
  occupied_slots integer,
  available_slots integer,
  active_sponsors integer,
  registered_users integer,
  active_announcements integer,
  active_stores integer,
  generated_leads integer
)
language sql
stable
security definer
set search_path = public
as $$
  with sponsor_counts as (
    select count(*)::integer as active_count
    from public.site_sponsors s
    where s.status = 'active'
      and s.starts_on <= ((now() at time zone 'America/Sao_Paulo')::date)
      and (s.ends_on is null or s.ends_on >= ((now() at time zone 'America/Sao_Paulo')::date))
  ),
  announcement_counts as (
    select count(*)::integer as active_count
    from public.announcements a
    where a.status = 'ACTIVE'
  ),
  user_counts as (
    select count(*)::integer as total_count
    from public.users u
    where u.email is not null
  ),
  store_counts as (
    select count(*)::integer as active_count
    from public.seller_stores st
    where st.is_active = true
      and st.is_store_feature_enabled = true
      and coalesce(st.is_paused_due_to_plan, false) = false
  ),
  lead_counts as (
    select count(*)::integer as total_count
    from public.leads l
  )
  select
    6::integer as total_slots,
    least(sc.active_count, 6)::integer as occupied_slots,
    greatest(6 - sc.active_count, 0)::integer as available_slots,
    sc.active_count::integer as active_sponsors,
    uc.total_count::integer as registered_users,
    ac.active_count::integer as active_announcements,
    stc.active_count::integer as active_stores,
    lc.total_count::integer as generated_leads
  from sponsor_counts sc
  cross join announcement_counts ac
  cross join user_counts uc
  cross join store_counts stc
  cross join lead_counts lc;
$$;

alter table public.site_sponsors enable row level security;

drop policy if exists "Admins can read site sponsors" on public.site_sponsors;
create policy "Admins can read site sponsors"
on public.site_sponsors
for select
to authenticated
using (public.is_admin_user());

drop policy if exists "Admins can insert site sponsors" on public.site_sponsors;
create policy "Admins can insert site sponsors"
on public.site_sponsors
for insert
to authenticated
with check (public.is_admin_user());

drop policy if exists "Admins can update site sponsors" on public.site_sponsors;
create policy "Admins can update site sponsors"
on public.site_sponsors
for update
to authenticated
using (public.is_admin_user())
with check (public.is_admin_user());

drop policy if exists "Admins can delete site sponsors" on public.site_sponsors;
create policy "Admins can delete site sponsors"
on public.site_sponsors
for delete
to authenticated
using (public.is_admin_user());

grant execute on function public.get_public_sponsor_landing_stats() to anon, authenticated;
