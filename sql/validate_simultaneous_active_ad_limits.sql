-- Troque o UUID abaixo antes de executar
-- Objetivo: validar a capacidade atual de anuncios ativos de um usuario

with user_context as (
  select '00000000-0000-0000-0000-000000000000'::uuid as target_user_id
),
active_subscription as (
  select
    us.user_id,
    p.name as plan_name,
    p.max_ads,
    us.current_period_start,
    us.current_period_end
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  join user_context uc on uc.target_user_id = us.user_id
  where us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1
),
active_ads as (
  select
    a.user_id,
    count(*)::int as active_ads_count
  from public.announcements a
  join user_context uc on uc.target_user_id = a.user_id
  where a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now())
  group by a.user_id
)
select
  uc.target_user_id as user_id,
  s.plan_name,
  s.max_ads,
  coalesce(a.active_ads_count, 0) as active_ads_count,
  greatest(coalesce(s.max_ads, 0) - coalesce(a.active_ads_count, 0), 0) as available_slots,
  coalesce(a.active_ads_count, 0) > coalesce(s.max_ads, 0) as is_over_limit,
  case
    when s.max_ads is null then true
    else coalesce(a.active_ads_count, 0) < s.max_ads
  end as can_publish_new,
  case
    when s.max_ads is null then true
    else coalesce(a.active_ads_count, 0) < s.max_ads
  end as can_reactivate
from user_context uc
left join active_subscription s on s.user_id = uc.target_user_id
left join active_ads a on a.user_id = uc.target_user_id;

with user_context as (
  select '00000000-0000-0000-0000-000000000000'::uuid as target_user_id
)
select
  a.id,
  a.title,
  a.status,
  case
    when a.status in ('ACTIVE', 'active') and a.expires_at is not null and a.expires_at <= now() then 'EXPIRED_BY_DATE'
    else a.status
  end as effective_status,
  a.created_at,
  a.expires_at
from public.announcements a
join user_context uc on uc.target_user_id = a.user_id
order by
  case when a.status in ('ACTIVE', 'active') then 0 else 1 end,
  a.created_at desc;
