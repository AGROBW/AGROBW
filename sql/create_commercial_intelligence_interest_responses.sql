create table if not exists public.commercial_intelligence_interest_responses (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.commercial_intelligence_outreach_deliveries(id) on delete cascade,
  campaign_id uuid not null references public.commercial_intelligence_outreach_campaigns(id) on delete cascade,
  seller_user_id uuid not null references public.users(id) on delete cascade,
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  buyer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commercial_intelligence_interest_responses_seller
  on public.commercial_intelligence_interest_responses (seller_user_id, created_at desc);

create index if not exists idx_commercial_intelligence_interest_responses_buyer
  on public.commercial_intelligence_interest_responses (buyer_user_id, created_at desc);

create or replace function public.touch_commercial_intelligence_interest_responses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_commercial_intelligence_interest_responses_updated_at
  on public.commercial_intelligence_interest_responses;
create trigger trigger_touch_commercial_intelligence_interest_responses_updated_at
before update on public.commercial_intelligence_interest_responses
for each row
execute function public.touch_commercial_intelligence_interest_responses_updated_at();

alter table public.commercial_intelligence_interest_responses enable row level security;

drop policy if exists "Users can read own commercial intelligence responses" on public.commercial_intelligence_interest_responses;
create policy "Users can read own commercial intelligence responses"
on public.commercial_intelligence_interest_responses
for select
to authenticated
using (
  auth.uid() = seller_user_id
  or auth.uid() = buyer_user_id
  or exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

create or replace function public.list_received_commercial_intelligence_opportunities()
returns table (
  delivery_id uuid,
  campaign_id uuid,
  category_slug text,
  subcategory_slug text,
  seller_label text,
  message_template text,
  received_at timestamptz,
  has_response boolean,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    deliveries.id as delivery_id,
    campaigns.id as campaign_id,
    campaigns.category_slug,
    campaigns.subcategory_slug,
    coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'Loja parceira da AGRO BW') as seller_label,
    campaigns.message_template,
    deliveries.created_at as received_at,
    responses.id is not null as has_response,
    responses.created_at as responded_at
  from public.commercial_intelligence_outreach_deliveries deliveries
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = deliveries.campaign_id
  join public.users seller on seller.id = campaigns.seller_user_id
  left join public.seller_stores store on store.user_id = seller.id
  left join public.commercial_intelligence_interest_responses responses on responses.delivery_id = deliveries.id
  where deliveries.recipient_user_id = v_user_id
  order by deliveries.created_at desc;
end;
$$;

create or replace function public.respond_to_commercial_intelligence_outreach(
  p_delivery_id uuid,
  p_buyer_note text default null
)
returns table (
  response_id uuid,
  seller_notification_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_campaign_id uuid;
  v_seller_user_id uuid;
  v_category_slug text;
  v_subcategory_slug text;
  v_response_id uuid;
  v_notification_id uuid;
  v_buyer_name text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select
    deliveries.campaign_id,
    campaigns.seller_user_id,
    campaigns.category_slug,
    campaigns.subcategory_slug
  into
    v_campaign_id,
    v_seller_user_id,
    v_category_slug,
    v_subcategory_slug
  from public.commercial_intelligence_outreach_deliveries deliveries
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = deliveries.campaign_id
  where deliveries.id = p_delivery_id
    and deliveries.recipient_user_id = v_user_id
  limit 1;

  if v_campaign_id is null then
    raise exception 'Oportunidade mediada nao encontrada para este usuario.';
  end if;

  if exists (
    select 1
    from public.commercial_intelligence_interest_responses responses
    where responses.delivery_id = p_delivery_id
  ) then
    raise exception 'Esta oportunidade ja recebeu uma resposta de interesse.';
  end if;

  select coalesce(nullif(name, ''), 'Comprador interessado')
  into v_buyer_name
  from public.users
  where id = v_user_id;

  insert into public.commercial_intelligence_interest_responses (
    delivery_id,
    campaign_id,
    seller_user_id,
    buyer_user_id,
    buyer_note
  )
  values (
    p_delivery_id,
    v_campaign_id,
    v_seller_user_id,
    v_user_id,
    nullif(trim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_response_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_seller_user_id,
    'SYSTEM',
    'Novo interesse confirmado na Inteligencia Comercial',
    format(
      '%s confirmou interesse em uma abordagem mediada para %s%s. A resposta foi registrada na AGRO BW para acompanhamento seguro.',
      split_part(v_buyer_name, ' ', 1),
      v_category_slug,
      case
        when coalesce(trim(v_subcategory_slug), '') = '' then ''
        else ' / ' || v_subcategory_slug
      end
    ),
    '/minha-conta/inteligencia-comercial'
  )
  returning id into v_notification_id;

  return query
  select v_response_id, v_notification_id;
end;
$$;

create or replace function public.list_sent_commercial_intelligence_interest_responses()
returns table (
  response_id uuid,
  campaign_id uuid,
  category_slug text,
  subcategory_slug text,
  buyer_name text,
  buyer_city text,
  buyer_state text,
  buyer_note text,
  responded_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  return query
  select
    responses.id as response_id,
    responses.campaign_id,
    campaigns.category_slug,
    campaigns.subcategory_slug,
    coalesce(nullif(buyer.name, ''), 'Comprador interessado') as buyer_name,
    nullif(buyer.cidade, '') as buyer_city,
    nullif(buyer.estado, '') as buyer_state,
    responses.buyer_note,
    responses.created_at as responded_at
  from public.commercial_intelligence_interest_responses responses
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = responses.campaign_id
  join public.users buyer on buyer.id = responses.buyer_user_id
  where responses.seller_user_id = v_user_id
  order by responses.created_at desc;
end;
$$;

grant execute on function public.list_received_commercial_intelligence_opportunities() to authenticated;
grant execute on function public.respond_to_commercial_intelligence_outreach(uuid, text) to authenticated;
grant execute on function public.list_sent_commercial_intelligence_interest_responses() to authenticated;
