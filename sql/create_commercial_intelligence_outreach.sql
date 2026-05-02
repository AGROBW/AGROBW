create table if not exists public.commercial_intelligence_outreach_campaigns (
  id uuid primary key default gen_random_uuid(),
  seller_user_id uuid not null references public.users(id) on delete cascade,
  category_slug text not null,
  subcategory_slug text,
  message_template text not null,
  recipients_count integer not null default 0,
  delivered_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_intelligence_outreach_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.commercial_intelligence_outreach_campaigns(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  status text not null default 'delivered' check (status in ('delivered', 'skipped', 'failed')),
  channel text not null default 'platform' check (channel in ('platform')),
  created_at timestamptz not null default now(),
  unique (campaign_id, recipient_user_id)
);

create index if not exists idx_commercial_intelligence_outreach_campaigns_user_month
  on public.commercial_intelligence_outreach_campaigns (seller_user_id, created_at desc);

create index if not exists idx_commercial_intelligence_outreach_deliveries_campaign
  on public.commercial_intelligence_outreach_deliveries (campaign_id, created_at desc);

create or replace function public.touch_commercial_intelligence_outreach_campaigns_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_commercial_intelligence_outreach_campaigns_updated_at
  on public.commercial_intelligence_outreach_campaigns;
create trigger trigger_touch_commercial_intelligence_outreach_campaigns_updated_at
before update on public.commercial_intelligence_outreach_campaigns
for each row
execute function public.touch_commercial_intelligence_outreach_campaigns_updated_at();

alter table public.commercial_intelligence_outreach_campaigns enable row level security;
alter table public.commercial_intelligence_outreach_deliveries enable row level security;

drop policy if exists "Users can read own commercial outreach campaigns" on public.commercial_intelligence_outreach_campaigns;
create policy "Users can read own commercial outreach campaigns"
on public.commercial_intelligence_outreach_campaigns
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

drop policy if exists "Users can read own commercial outreach deliveries" on public.commercial_intelligence_outreach_deliveries;
create policy "Users can read own commercial outreach deliveries"
on public.commercial_intelligence_outreach_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.commercial_intelligence_outreach_campaigns campaigns
    where campaigns.id = campaign_id
      and (
        campaigns.seller_user_id = auth.uid()
        or exists (
          select 1
          from public.users
          where users.id = auth.uid()
            and users.is_admin = true
        )
      )
  )
);

create or replace function public.dispatch_commercial_intelligence_outreach(
  p_category_slug text,
  p_subcategory_slug text default null,
  p_message text default null
)
returns table (
  campaign_id uuid,
  recipients_count integer,
  delivered_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan_limit integer := 0;
  v_outreachs_used integer := 0;
  v_campaign_id uuid;
  v_message text;
  v_seller_label text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if coalesce(trim(p_category_slug), '') = '' then
    raise exception 'Selecione uma categoria para enviar a abordagem mediada.';
  end if;

  v_message := trim(coalesce(p_message, ''));
  if char_length(v_message) < 40 then
    raise exception 'Escreva uma mensagem com pelo menos 40 caracteres.';
  end if;

  if char_length(v_message) > 1200 then
    raise exception 'A mensagem pode ter no maximo 1200 caracteres.';
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
    raise exception 'Seu plano atual nao inclui o envio mediado da inteligencia comercial.';
  end if;

  select count(*)
  into v_outreachs_used
  from public.commercial_intelligence_outreach_campaigns campaigns
  where campaigns.seller_user_id = v_user_id
    and campaigns.created_at >= date_trunc('month', now())
    and campaigns.created_at < date_trunc('month', now()) + interval '1 month';

  if v_outreachs_used >= 1 then
    raise exception 'Este MVP permite uma campanha mediada por mes para cada conta elegivel.';
  end if;

  select
    coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'uma loja parceira da AGRO BW')
  into v_seller_label
  from public.users seller
  left join public.seller_stores store on store.user_id = seller.id
  where seller.id = v_user_id
  limit 1;

  insert into public.commercial_intelligence_outreach_campaigns (
    seller_user_id,
    category_slug,
    subcategory_slug,
    message_template
  )
  values (
    v_user_id,
    trim(p_category_slug),
    nullif(trim(coalesce(p_subcategory_slug, '')), ''),
    v_message
  )
  returning id into v_campaign_id;

  with filtered_announcements as (
    select
      a.id,
      a.category_slug,
      a.sub_category_id,
      a.sub_category_label
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
      count(*)::integer as announcement_views,
      0::integer as favorites_count,
      0::integer as lead_actions,
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
      0::integer as announcement_views,
      count(*)::integer as favorites_count,
      0::integer as lead_actions,
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
      0::integer as announcement_views,
      0::integer as favorites_count,
      count(*)::integer as lead_actions,
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
      sum(cs.announcement_views)::integer as announcement_views,
      sum(cs.favorites_count)::integer as favorites_count,
      sum(cs.lead_actions)::integer as lead_actions,
      max(cs.last_activity_at) as last_activity_at,
      case
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 10 then 3
        when (sum(cs.lead_actions) * 6 + sum(cs.favorites_count) * 4 + sum(cs.announcement_views)) >= 4 then 2
        else 1
      end as score_order
    from consolidated_signals cs
    group by cs.user_id
  ),
  eligible_optins as (
    select
      bi.user_id,
      bi.score_order,
      bi.last_activity_at
    from buyer_interest bi
    join public.commercial_lead_preferences clp on clp.user_id = bi.user_id
    where clp.allow_commercial_contact = true
      and clp.consent_granted_at is not null
      and clp.consent_revoked_at is null
      and coalesce(array_length(clp.allowed_category_slugs, 1), 0) >= 0
      and (
        coalesce(array_length(clp.allowed_category_slugs, 1), 0) = 0
        or trim(p_category_slug) = any(clp.allowed_category_slugs)
      )
      and 'platform' = any(clp.preferred_channels)
    order by bi.score_order desc, bi.last_activity_at desc nulls last
    limit 50
  ),
  inserted_notifications as (
    insert into public.notifications (
      user_id,
      type,
      title,
      content,
      link
    )
    select
      optins.user_id,
      'SYSTEM',
      'Nova oportunidade comercial no seu segmento',
      format(
        '%s enviou uma proposta mediada pela AGRO BW para compradores com interesse em %s%s. Abra a central para avaliar a oportunidade e iniciar contato somente se desejar. Mensagem: %s',
        coalesce(v_seller_label, 'Uma loja parceira da AGRO BW'),
        trim(p_category_slug),
        case
          when coalesce(trim(p_subcategory_slug), '') = '' then ''
          else ' / ' || trim(p_subcategory_slug)
        end,
        v_message
      ),
      '/minha-conta/inteligencia-comercial'
    from eligible_optins optins
    returning id, user_id
  ),
  inserted_deliveries as (
    insert into public.commercial_intelligence_outreach_deliveries (
      campaign_id,
      recipient_user_id,
      notification_id,
      status,
      channel
    )
    select
      v_campaign_id,
      notifications.user_id,
      notifications.id,
      'delivered',
      'platform'
    from inserted_notifications notifications
    returning id
  )
  update public.commercial_intelligence_outreach_campaigns campaigns
  set
    recipients_count = (
      select count(*) from eligible_optins
    ),
    delivered_count = (
      select count(*) from inserted_deliveries
    )
  where campaigns.id = v_campaign_id;

  return query
  select
    campaigns.id,
    campaigns.recipients_count,
    campaigns.delivered_count
  from public.commercial_intelligence_outreach_campaigns campaigns
  where campaigns.id = v_campaign_id;
end;
$$;

grant execute on function public.dispatch_commercial_intelligence_outreach(text, text, text) to authenticated;
