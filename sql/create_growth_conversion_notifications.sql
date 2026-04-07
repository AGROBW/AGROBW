create table if not exists public.growth_conversion_settings (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean not null default true,
  daily_user_limit integer not null default 1,
  min_views_for_high_views integer not null default 20,
  min_views_for_no_leads integer not null default 50,
  min_views_for_expiring integer not null default 15,
  expire_soon_days integer not null default 7,
  trigger_high_views_enabled boolean not null default true,
  trigger_top_category_enabled boolean not null default true,
  trigger_no_leads_enabled boolean not null default true,
  trigger_expiring_enabled boolean not null default true,
  trigger_plan_limit_enabled boolean not null default true,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint growth_conversion_settings_daily_limit_check check (daily_user_limit >= 0),
  constraint growth_conversion_settings_high_views_check check (min_views_for_high_views >= 0),
  constraint growth_conversion_settings_no_leads_check check (min_views_for_no_leads >= 0),
  constraint growth_conversion_settings_expiring_views_check check (min_views_for_expiring >= 0),
  constraint growth_conversion_settings_expire_days_check check (expire_soon_days >= 1)
);

create unique index if not exists growth_conversion_settings_singleton_idx
  on public.growth_conversion_settings ((true));

insert into public.growth_conversion_settings (
  is_enabled,
  daily_user_limit,
  min_views_for_high_views,
  min_views_for_no_leads,
  min_views_for_expiring,
  expire_soon_days,
  trigger_high_views_enabled,
  trigger_top_category_enabled,
  trigger_no_leads_enabled,
  trigger_expiring_enabled,
  trigger_plan_limit_enabled
)
select
  true,
  1,
  20,
  50,
  15,
  7,
  true,
  true,
  true,
  true,
  true
where not exists (
  select 1
  from public.growth_conversion_settings
);

alter table public.growth_conversion_settings enable row level security;

drop policy if exists "Admins can manage growth conversion settings" on public.growth_conversion_settings;
create policy "Admins can manage growth conversion settings"
on public.growth_conversion_settings
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

create or replace function public.generate_growth_conversion_notification_for_user(
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.growth_conversion_settings%rowtype;
  v_plan record;
  v_notifications_today integer := 0;
  v_candidate record;
  v_title text;
  v_content text;
  v_link text := '/minha-conta/meu-plano?source=growth';
  v_notification_id uuid;
  v_days_left integer;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select *
  into v_settings
  from public.growth_conversion_settings
  limit 1;

  if not found then
    insert into public.growth_conversion_settings default values
    returning * into v_settings;
  end if;

  if not coalesce(v_settings.is_enabled, true) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'disabled'
    );
  end if;

  select
    p.name,
    coalesce(p.category_highlights_count, 0) as category_highlights_count,
    coalesce(p.home_highlight_count, 0) as home_highlight_count
  into v_plan
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where us.user_id = p_user_id
    and us.status = 'active'
    and us.current_period_end > now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_active_plan'
    );
  end if;

  if not (
    lower(coalesce(v_plan.name, '')) in ('start', 'básico', 'basico')
    or (
      coalesce(v_plan.category_highlights_count, 0) = 0
      and coalesce(v_plan.home_highlight_count, 0) = 0
    )
  ) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'plan_not_eligible'
    );
  end if;

  select count(*)
  into v_notifications_today
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'plan_alert'
    and n.title like 'Oportunidade AGRO BW:%'
    and n.created_at >= date_trunc('day', now());

  if v_notifications_today >= greatest(coalesce(v_settings.daily_user_limit, 1), 0) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'daily_limit_reached'
    );
  end if;

  with chat_counts as (
    select
      c.announcement_id,
      count(*)::integer as chats_count
    from public.chats c
    where c.announcement_id is not null
    group by c.announcement_id
  ),
  lead_counts as (
    select
      l.announcement_id,
      count(*)::integer as leads_count
    from public.leads l
    where l.announcement_id is not null
    group by l.announcement_id
  ),
  all_active_ads as (
    select
      a.id,
      a.user_id,
      a.title,
      coalesce(a.views, 0) as views,
      a.created_at,
      a.expires_at,
      a.category_slug,
      coalesce(cc.chats_count, 0) as chats_count,
      coalesce(lc.leads_count, 0) as leads_count,
      dense_rank() over (
        partition by a.category_slug
        order by coalesce(a.views, 0) desc, a.created_at asc
      ) as category_rank
    from public.announcements a
    left join chat_counts cc
      on cc.announcement_id = a.id
    left join lead_counts lc
      on lc.announcement_id = a.id
    where upper(coalesce(a.status, '')) = 'ACTIVE'
      and (a.expires_at is null or a.expires_at > now())
  ),
  eligible as (
    select
      aa.*,
      case
        when coalesce(v_settings.trigger_no_leads_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_no_leads, 50)
          and aa.leads_count = 0
          and aa.chats_count = 0
          then 'no_leads'
        when coalesce(v_settings.trigger_top_category_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          and aa.category_rank <= 3
          then 'top_category'
        when coalesce(v_settings.trigger_expiring_enabled, true)
          and aa.expires_at is not null
          and aa.expires_at <= now() + make_interval(days => coalesce(v_settings.expire_soon_days, 7))
          and aa.views >= coalesce(v_settings.min_views_for_expiring, 15)
          then 'expiring'
        when coalesce(v_settings.trigger_plan_limit_enabled, true)
          and (aa.leads_count > 0 or aa.chats_count > 0)
          then 'plan_limit'
        when coalesce(v_settings.trigger_high_views_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          then 'high_views'
        else null
      end as trigger_kind,
      case
        when coalesce(v_settings.trigger_no_leads_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_no_leads, 50)
          and aa.leads_count = 0
          and aa.chats_count = 0
          then 1
        when coalesce(v_settings.trigger_top_category_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          and aa.category_rank <= 3
          then 2
        when coalesce(v_settings.trigger_expiring_enabled, true)
          and aa.expires_at is not null
          and aa.expires_at <= now() + make_interval(days => coalesce(v_settings.expire_soon_days, 7))
          and aa.views >= coalesce(v_settings.min_views_for_expiring, 15)
          then 3
        when coalesce(v_settings.trigger_plan_limit_enabled, true)
          and (aa.leads_count > 0 or aa.chats_count > 0)
          then 4
        when coalesce(v_settings.trigger_high_views_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          then 5
        else 99
      end as trigger_priority
    from all_active_ads aa
    where aa.user_id = p_user_id
  )
  select *
  into v_candidate
  from eligible
  where trigger_kind is not null
  order by trigger_priority asc, views desc, created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_trigger_matched'
    );
  end if;

  case v_candidate.trigger_kind
    when 'no_leads' then
      v_title := 'Oportunidade AGRO BW: alta audiência sem conversão';
      v_content := format(
        'Seu anúncio "%s" já acumulou %s visualizações e ainda não recebeu contatos. Um plano com destaque pode aumentar suas chances de conversão.',
        v_candidate.title,
        v_candidate.views
      );
    when 'top_category' then
      v_title := 'Oportunidade AGRO BW: anúncio em evidência na categoria';
      v_content := format(
        'Seu anúncio "%s" está entre os mais vistos da categoria. Um destaque pode acelerar contatos e ampliar a exposição.',
        v_candidate.title
      );
    when 'expiring' then
      v_days_left := greatest(1, ceil(extract(epoch from (v_candidate.expires_at - now())) / 86400.0)::integer);
      v_title := 'Oportunidade AGRO BW: anúncio perto do vencimento';
      v_content := format(
        'Seu anúncio "%s" expira em %s dia(s) e já chamou atenção de compradores. Aproveite o momento para reforçar a exposição.',
        v_candidate.title,
        v_days_left
      );
    when 'plan_limit' then
      v_title := 'Oportunidade AGRO BW: seu plano limita a exposição';
      v_content := format(
        'Seu anúncio "%s" já está gerando interesse, mas o plano atual não libera destaques Home/Categoria. Fazer upgrade agora pode ampliar o alcance.',
        v_candidate.title
      );
    else
      v_title := 'Oportunidade AGRO BW: anúncio com boa tração';
      v_content := format(
        'Seu anúncio "%s" já acumulou %s visualizações. Destacá-lo agora pode ajudar a transformar audiência em contatos.',
        v_candidate.title,
        v_candidate.views
      );
  end case;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    p_user_id,
    'plan_alert',
    v_title,
    v_content,
    v_link
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'success', true,
    'created', true,
    'notification_id', v_notification_id,
    'trigger', v_candidate.trigger_kind,
    'title', v_title,
    'content', v_content,
    'link', v_link,
    'announcement_id', v_candidate.id,
    'announcement_title', v_candidate.title
  );
end;
$$;

grant execute on function public.generate_growth_conversion_notification_for_user(uuid) to authenticated;

create or replace function public.generate_growth_conversion_notifications_batch()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_result jsonb;
  v_created_count integer := 0;
begin
  for v_user_id in
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans p
      on p.id = us.plan_id
    where us.status = 'active'
      and us.current_period_end > now()
      and (
        lower(coalesce(p.name, '')) in ('start', 'básico', 'basico')
        or (
          coalesce(p.category_highlights_count, 0) = 0
          and coalesce(p.home_highlight_count, 0) = 0
        )
      )
  loop
    v_result := public.generate_growth_conversion_notification_for_user(v_user_id);

    if coalesce((v_result ->> 'created')::boolean, false) then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$$;

grant execute on function public.generate_growth_conversion_notifications_batch() to authenticated;
