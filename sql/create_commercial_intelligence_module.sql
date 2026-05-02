alter table public.plans
  add column if not exists has_commercial_intelligence boolean not null default false,
  add column if not exists commercial_intelligence_requests_per_month integer not null default 0;

create table if not exists public.commercial_lead_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  allow_commercial_contact boolean not null default false,
  allowed_category_slugs text[] not null default '{}',
  preferred_channels text[] not null default array['platform'],
  consent_text_version text not null default 'commercial-intelligence-v1',
  consent_granted_at timestamptz,
  consent_revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_intelligence_requests (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.users(id) on delete cascade,
  category_slug text not null,
  subcategory_slug text,
  generated_rows integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_commercial_intelligence_requests_user_month
  on public.commercial_intelligence_requests (seller_user_id, created_at desc);

create index if not exists idx_commercial_lead_preferences_optin
  on public.commercial_lead_preferences (allow_commercial_contact, updated_at desc);

create or replace function public.touch_commercial_lead_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_commercial_lead_preferences_updated_at on public.commercial_lead_preferences;
create trigger trigger_touch_commercial_lead_preferences_updated_at
before update on public.commercial_lead_preferences
for each row
execute function public.touch_commercial_lead_preferences_updated_at();

alter table public.commercial_lead_preferences enable row level security;
alter table public.commercial_intelligence_requests enable row level security;

drop policy if exists "Users can read own commercial lead preferences" on public.commercial_lead_preferences;
create policy "Users can read own commercial lead preferences"
on public.commercial_lead_preferences
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

drop policy if exists "Users can upsert own commercial lead preferences" on public.commercial_lead_preferences;
create policy "Users can upsert own commercial lead preferences"
on public.commercial_lead_preferences
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own commercial intelligence requests" on public.commercial_intelligence_requests;
create policy "Users can read own commercial intelligence requests"
on public.commercial_intelligence_requests
for select
to authenticated
using (
  auth.uid() = seller_user_id
  or exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

drop policy if exists "Users can create own commercial intelligence requests" on public.commercial_intelligence_requests;
create policy "Users can create own commercial intelligence requests"
on public.commercial_intelligence_requests
for insert
to authenticated
with check (auth.uid() = seller_user_id);

create or replace function public.generate_commercial_intelligence_report(
  p_category_slug text,
  p_subcategory_slug text default null
)
returns table (
  state text,
  city text,
  score_band text,
  interested_buyers bigint,
  consenting_buyers bigint,
  announcement_views bigint,
  favorites_count bigint,
  lead_actions bigint,
  price_min numeric,
  price_max numeric,
  last_activity_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_limit integer := 0;
  v_requests_used integer := 0;
  v_request_id uuid;
  v_rows_generated integer := 0;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if coalesce(trim(p_category_slug), '') = '' then
    raise exception 'Selecione uma categoria para gerar a inteligencia comercial.';
  end if;

  select
    coalesce(p.commercial_intelligence_requests_per_month, 0)
  into v_plan_limit
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = v_user_id
    and us.status in ('active', 'trialing', 'past_due')
    and coalesce(p.has_commercial_intelligence, false) = true
  order by
    us.current_period_end desc nulls last,
    us.created_at desc nulls last
  limit 1;

  if coalesce(v_plan_limit, 0) <= 0 then
    raise exception 'Seu plano atual nao inclui inteligencia comercial.';
  end if;

  select count(*)
  into v_requests_used
  from public.commercial_intelligence_requests cir
  where cir.seller_user_id = v_user_id
    and cir.created_at >= date_trunc('month', now())
    and cir.created_at < date_trunc('month', now()) + interval '1 month';

  if v_requests_used >= v_plan_limit then
    raise exception 'Voce atingiu o limite mensal de consultas de inteligencia comercial do seu plano.';
  end if;

  insert into public.commercial_intelligence_requests (
    seller_user_id,
    category_slug,
    subcategory_slug
  )
  values (
    v_user_id,
    trim(p_category_slug),
    nullif(trim(coalesce(p_subcategory_slug, '')), '')
  )
  returning id into v_request_id;

  return query
  with filtered_announcements as (
    select
      a.id,
      a.category_slug,
      a.sub_category_id,
      a.sub_category_label,
      nullif(a.city, '') as city,
      nullif(a.state, '') as state,
      case
        when a.price is null then null
        else a.price::numeric
      end as price
    from public.announcements a
    where a.category_slug = trim(p_category_slug)
      and (
        coalesce(trim(p_subcategory_slug), '') = ''
        or lower(coalesce(a.sub_category_label, '')) = lower(trim(p_subcategory_slug))
        or lower(coalesce(a.sub_category_id::text, '')) = lower(trim(p_subcategory_slug))
      )
  ),
  announcement_views as (
    select
      spv.user_id,
      count(*)::bigint as announcement_views,
      0::bigint as favorites_count,
      0::bigint as lead_actions,
      min(fa.price) as price_min,
      max(fa.price) as price_max,
      max(spv.created_at) as last_activity_at
    from public.site_page_views spv
    join filtered_announcements fa on fa.id = spv.entity_id
    where spv.page_type = 'announcement'
      and spv.is_admin_area = false
      and spv.user_id is not null
      and spv.user_id <> v_user_id
      and spv.created_at >= now() - interval '30 days'
    group by spv.user_id
  ),
  favorite_signals as (
    select
      f.user_id,
      0::bigint as announcement_views,
      count(*)::bigint as favorites_count,
      0::bigint as lead_actions,
      min(fa.price) as price_min,
      max(fa.price) as price_max,
      max(f.created_at) as last_activity_at
    from public.favorites f
    join filtered_announcements fa on fa.id = f.announcement_id
    where f.user_id <> v_user_id
      and f.created_at >= now() - interval '30 days'
    group by f.user_id
  ),
  lead_signals as (
    select
      l.buyer_id as user_id,
      0::bigint as announcement_views,
      0::bigint as favorites_count,
      count(*)::bigint as lead_actions,
      min(fa.price) as price_min,
      max(fa.price) as price_max,
      max(l.created_at) as last_activity_at
    from public.leads l
    join filtered_announcements fa on fa.id = l.announcement_id
    where l.buyer_id <> v_user_id
      and l.created_at >= now() - interval '30 days'
    group by l.buyer_id
  ),
  consolidated_signals as (
    select * from announcement_views
    union all
    select * from favorite_signals
    union all
    select * from lead_signals
  ),
  buyer_interest as (
    select
      cs.user_id,
      nullif(u.estado, '') as state,
      nullif(u.cidade, '') as city,
      sum(cs.announcement_views)::bigint as announcement_views,
      sum(cs.favorites_count)::bigint as favorites_count,
      sum(cs.lead_actions)::bigint as lead_actions,
      min(cs.price_min) as price_min,
      max(cs.price_max) as price_max,
      max(cs.last_activity_at) as last_activity_at,
      case
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 10 then 'high'
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 4 then 'medium'
        else 'low'
      end as score_band,
      case
        when clp.allow_commercial_contact = true
         and clp.consent_granted_at is not null
         and clp.consent_revoked_at is null
         and (
           coalesce(array_length(clp.allowed_category_slugs, 1), 0) = 0
           or trim(p_category_slug) = any(clp.allowed_category_slugs)
         )
        then true
        else false
      end as has_opt_in
    from consolidated_signals cs
    join public.users u on u.id = cs.user_id
    left join public.commercial_lead_preferences clp on clp.user_id = cs.user_id
    group by
      cs.user_id,
      u.estado,
      u.cidade,
      clp.allow_commercial_contact,
      clp.consent_granted_at,
      clp.consent_revoked_at,
      clp.allowed_category_slugs
  )
  select
    coalesce(bi.state, 'Nao informado') as state,
    bi.city,
    bi.score_band,
    count(*)::bigint as interested_buyers,
    count(*) filter (where bi.has_opt_in)::bigint as consenting_buyers,
    sum(bi.announcement_views)::bigint as announcement_views,
    sum(bi.favorites_count)::bigint as favorites_count,
    sum(bi.lead_actions)::bigint as lead_actions,
    min(bi.price_min) as price_min,
    max(bi.price_max) as price_max,
    max(bi.last_activity_at) as last_activity_at
  from buyer_interest bi
  group by
    coalesce(bi.state, 'Nao informado'),
    bi.city,
    bi.score_band
  order by
    case bi.score_band
      when 'high' then 1
      when 'medium' then 2
      else 3
    end asc,
    consenting_buyers desc,
    interested_buyers desc,
    announcement_views desc,
    last_activity_at desc nulls last;

  get diagnostics v_rows_generated = row_count;

  update public.commercial_intelligence_requests
  set generated_rows = coalesce(v_rows_generated, 0)
  where id = v_request_id;
end;
$$;

grant execute on function public.generate_commercial_intelligence_report(text, text) to authenticated;
