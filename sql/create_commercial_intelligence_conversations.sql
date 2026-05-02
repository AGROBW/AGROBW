create table if not exists public.commercial_intelligence_conversations (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null unique references public.commercial_intelligence_interest_responses(id) on delete cascade,
  campaign_id uuid not null references public.commercial_intelligence_outreach_campaigns(id) on delete cascade,
  seller_user_id uuid not null references public.users(id) on delete cascade,
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_intelligence_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.commercial_intelligence_conversations(id) on delete cascade,
  sender_user_id uuid not null references public.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_commercial_intelligence_conversations_seller
  on public.commercial_intelligence_conversations (seller_user_id, updated_at desc);

create index if not exists idx_commercial_intelligence_conversations_buyer
  on public.commercial_intelligence_conversations (buyer_user_id, updated_at desc);

create index if not exists idx_commercial_intelligence_conversation_messages_conversation
  on public.commercial_intelligence_conversation_messages (conversation_id, created_at asc);

create or replace function public.touch_commercial_intelligence_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_commercial_intelligence_conversations_updated_at
  on public.commercial_intelligence_conversations;
create trigger trigger_touch_commercial_intelligence_conversations_updated_at
before update on public.commercial_intelligence_conversations
for each row
execute function public.touch_commercial_intelligence_conversations_updated_at();

alter table public.commercial_intelligence_conversations enable row level security;
alter table public.commercial_intelligence_conversation_messages enable row level security;

drop policy if exists "Users can read own commercial intelligence conversations" on public.commercial_intelligence_conversations;
create policy "Users can read own commercial intelligence conversations"
on public.commercial_intelligence_conversations
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

drop policy if exists "Users can read own commercial intelligence conversation messages" on public.commercial_intelligence_conversation_messages;
create policy "Users can read own commercial intelligence conversation messages"
on public.commercial_intelligence_conversation_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.commercial_intelligence_conversations conversations
    where conversations.id = conversation_id
      and (
        conversations.seller_user_id = auth.uid()
        or conversations.buyer_user_id = auth.uid()
        or exists (
          select 1
          from public.users
          where users.id = auth.uid()
            and users.is_admin = true
        )
      )
  )
);

create or replace function public.list_my_commercial_intelligence_conversations()
returns table (
  conversation_id uuid,
  response_id uuid,
  campaign_id uuid,
  category_slug text,
  subcategory_slug text,
  role text,
  counterpart_name text,
  counterpart_city text,
  counterpart_state text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  last_message_preview text,
  last_message_at timestamptz
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
  with latest_messages as (
    select distinct on (messages.conversation_id)
      messages.conversation_id,
      messages.content,
      messages.created_at
    from public.commercial_intelligence_conversation_messages messages
    order by messages.conversation_id, messages.created_at desc
  )
  select
    conversations.id as conversation_id,
    conversations.response_id,
    conversations.campaign_id,
    campaigns.category_slug,
    campaigns.subcategory_slug,
    case
      when conversations.seller_user_id = v_user_id then 'seller'
      else 'buyer'
    end as role,
    case
      when conversations.seller_user_id = v_user_id then coalesce(nullif(buyer.name, ''), 'Comprador interessado')
      else coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'Loja parceira da AGRO BW')
    end as counterpart_name,
    case
      when conversations.seller_user_id = v_user_id then nullif(buyer.cidade, '')
      else nullif(seller.cidade, '')
    end as counterpart_city,
    case
      when conversations.seller_user_id = v_user_id then nullif(buyer.estado, '')
      else nullif(seller.estado, '')
    end as counterpart_state,
    conversations.status,
    conversations.created_at,
    conversations.updated_at,
    latest.content as last_message_preview,
    latest.created_at as last_message_at
  from public.commercial_intelligence_conversations conversations
  join public.commercial_intelligence_outreach_campaigns campaigns on campaigns.id = conversations.campaign_id
  join public.users seller on seller.id = conversations.seller_user_id
  join public.users buyer on buyer.id = conversations.buyer_user_id
  left join public.seller_stores store on store.user_id = seller.id
  left join latest_messages latest on latest.conversation_id = conversations.id
  where conversations.seller_user_id = v_user_id
     or conversations.buyer_user_id = v_user_id
  order by coalesce(latest.created_at, conversations.updated_at) desc;
end;
$$;

create or replace function public.list_commercial_intelligence_conversation_messages(
  p_conversation_id uuid
)
returns table (
  message_id uuid,
  sender_user_id uuid,
  sender_name text,
  content text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_allowed boolean := false;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select exists (
    select 1
    from public.commercial_intelligence_conversations conversations
    where conversations.id = p_conversation_id
      and (
        conversations.seller_user_id = v_user_id
        or conversations.buyer_user_id = v_user_id
      )
  )
  into v_allowed;

  if not v_allowed then
    raise exception 'Conversa mediada nao encontrada para este usuario.';
  end if;

  return query
  select
    messages.id as message_id,
    messages.sender_user_id,
    case
      when messages.sender_user_id = conversations.seller_user_id then coalesce(nullif(store.store_name, ''), nullif(seller.name, ''), 'Loja parceira da AGRO BW')
      else coalesce(nullif(buyer.name, ''), 'Comprador interessado')
    end as sender_name,
    messages.content,
    messages.created_at
  from public.commercial_intelligence_conversation_messages messages
  join public.commercial_intelligence_conversations conversations on conversations.id = messages.conversation_id
  join public.users seller on seller.id = conversations.seller_user_id
  join public.users buyer on buyer.id = conversations.buyer_user_id
  left join public.seller_stores store on store.user_id = seller.id
  where messages.conversation_id = p_conversation_id
  order by messages.created_at asc;
end;
$$;

create or replace function public.start_commercial_intelligence_conversation(
  p_response_id uuid,
  p_initial_message text
)
returns table (
  conversation_id uuid,
  message_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_conversation_id uuid;
  v_message_id uuid;
  v_buyer_user_id uuid;
  v_campaign_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if char_length(trim(coalesce(p_initial_message, ''))) < 10 then
    raise exception 'Escreva uma mensagem inicial com pelo menos 10 caracteres.';
  end if;

  select
    responses.buyer_user_id,
    responses.campaign_id
  into
    v_buyer_user_id,
    v_campaign_id
  from public.commercial_intelligence_interest_responses responses
  where responses.id = p_response_id
    and responses.seller_user_id = v_user_id
  limit 1;

  if v_buyer_user_id is null then
    raise exception 'Resposta de interesse nao encontrada para esta loja.';
  end if;

  if exists (
    select 1
    from public.commercial_intelligence_conversations conversations
    where conversations.response_id = p_response_id
  ) then
    raise exception 'Esta resposta ja possui uma conversa mediada em andamento.';
  end if;

  insert into public.commercial_intelligence_conversations (
    response_id,
    campaign_id,
    seller_user_id,
    buyer_user_id
  )
  values (
    p_response_id,
    v_campaign_id,
    v_user_id,
    v_buyer_user_id
  )
  returning id into v_conversation_id;

  insert into public.commercial_intelligence_conversation_messages (
    conversation_id,
    sender_user_id,
    content
  )
  values (
    v_conversation_id,
    v_user_id,
    trim(p_initial_message)
  )
  returning id into v_message_id;

  update public.commercial_intelligence_conversations
  set updated_at = now()
  where id = v_conversation_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_buyer_user_id,
    'SYSTEM',
    'Loja iniciou uma conversa mediada com voce',
    'Uma loja parceira abriu um canal seguro de conversa na Inteligencia Comercial. Voce pode responder dentro da AGRO BW sem compartilhar seus contatos diretos.',
    '/minha-conta/inteligencia-comercial'
  );

  return query
  select v_conversation_id, v_message_id;
end;
$$;

create or replace function public.send_commercial_intelligence_conversation_message(
  p_conversation_id uuid,
  p_message text
)
returns table (
  message_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
  v_recipient_user_id uuid;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if char_length(trim(coalesce(p_message, ''))) < 1 then
    raise exception 'Escreva uma mensagem para enviar.';
  end if;

  select
    conversations.status,
    case
      when conversations.seller_user_id = v_user_id then conversations.buyer_user_id
      when conversations.buyer_user_id = v_user_id then conversations.seller_user_id
      else null
    end
  into
    v_status,
    v_recipient_user_id
  from public.commercial_intelligence_conversations conversations
  where conversations.id = p_conversation_id
  limit 1;

  if v_recipient_user_id is null then
    raise exception 'Conversa mediada nao encontrada para este usuario.';
  end if;

  if v_status <> 'open' then
    raise exception 'Esta conversa mediada esta encerrada.';
  end if;

  insert into public.commercial_intelligence_conversation_messages (
    conversation_id,
    sender_user_id,
    content
  )
  values (
    p_conversation_id,
    v_user_id,
    trim(p_message)
  )
  returning id into v_message_id;

  update public.commercial_intelligence_conversations
  set updated_at = now()
  where id = p_conversation_id;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    v_recipient_user_id,
    'SYSTEM',
    'Nova mensagem na conversa mediada',
    'Ha uma nova mensagem na sua conversa mediada de Inteligencia Comercial. Abra a AGRO BW para continuar o atendimento com seguranca.',
    '/minha-conta/inteligencia-comercial'
  );

  return query
  select v_message_id;
end;
$$;

grant execute on function public.list_my_commercial_intelligence_conversations() to authenticated;
grant execute on function public.list_commercial_intelligence_conversation_messages(uuid) to authenticated;
grant execute on function public.start_commercial_intelligence_conversation(uuid, text) to authenticated;
grant execute on function public.send_commercial_intelligence_conversation_message(uuid, text) to authenticated;
