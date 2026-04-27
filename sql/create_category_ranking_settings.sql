create table if not exists public.category_ranking_settings (
  id uuid primary key default gen_random_uuid(),
  novelty_boost_48h integer not null default 10,
  novelty_boost_7d integer not null default 5,
  freshness_multiplier numeric(6,2) not null default 1.00,
  quality_multiplier numeric(6,2) not null default 1.00,
  engagement_multiplier numeric(6,2) not null default 1.00,
  verification_weight integer not null default 16,
  home_highlight_weight integer not null default 220,
  active_plan_base_weight integer not null default 300,
  active_plan_price_multiplier numeric(6,2) not null default 100.00,
  active_plan_price_cap integer not null default 120,
  stale_penalty_7d integer not null default 4,
  stale_penalty_14d integer not null default 10,
  stale_penalty_30d integer not null default 18,
  seller_rotation_limit integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists category_ranking_settings_singleton_idx
  on public.category_ranking_settings ((true));

insert into public.category_ranking_settings (
  novelty_boost_48h,
  novelty_boost_7d,
  freshness_multiplier,
  quality_multiplier,
  engagement_multiplier,
  verification_weight,
  home_highlight_weight,
  active_plan_base_weight,
  active_plan_price_multiplier,
  active_plan_price_cap,
  stale_penalty_7d,
  stale_penalty_14d,
  stale_penalty_30d,
  seller_rotation_limit
)
select
  10,
  5,
  1.00,
  1.00,
  1.00,
  16,
  220,
  300,
  100.00,
  120,
  4,
  10,
  18,
  2
where not exists (
  select 1 from public.category_ranking_settings
);

create or replace function public.touch_category_ranking_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_category_ranking_settings_updated_at on public.category_ranking_settings;
create trigger trg_touch_category_ranking_settings_updated_at
before update on public.category_ranking_settings
for each row
execute function public.touch_category_ranking_settings_updated_at();

alter table public.category_ranking_settings enable row level security;

drop policy if exists "Admins can manage category ranking settings" on public.category_ranking_settings;
create policy "Admins can manage category ranking settings"
on public.category_ranking_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or u.role = 'admin')
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or u.role = 'admin')
  )
);

create or replace function public.get_public_category_ranking_settings()
returns table (
  novelty_boost_48h integer,
  novelty_boost_7d integer,
  freshness_multiplier numeric,
  quality_multiplier numeric,
  engagement_multiplier numeric,
  verification_weight integer,
  home_highlight_weight integer,
  active_plan_base_weight integer,
  active_plan_price_multiplier numeric,
  active_plan_price_cap integer,
  stale_penalty_7d integer,
  stale_penalty_14d integer,
  stale_penalty_30d integer,
  seller_rotation_limit integer
)
language sql
security definer
set search_path = public
as $$
  select
    novelty_boost_48h,
    novelty_boost_7d,
    freshness_multiplier,
    quality_multiplier,
    engagement_multiplier,
    verification_weight,
    home_highlight_weight,
    active_plan_base_weight,
    active_plan_price_multiplier,
    active_plan_price_cap,
    stale_penalty_7d,
    stale_penalty_14d,
    stale_penalty_30d,
    seller_rotation_limit
  from public.category_ranking_settings
  limit 1;
$$;

grant execute on function public.get_public_category_ranking_settings() to anon, authenticated;
