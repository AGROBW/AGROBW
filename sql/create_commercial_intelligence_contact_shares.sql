create table if not exists public.commercial_intelligence_contact_shares (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.commercial_intelligence_conversations(id) on delete cascade,
  seller_user_id uuid not null references public.users(id) on delete cascade,
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  share_email boolean not null default false,
  share_whatsapp boolean not null default false,
  shared_email text,
  shared_whatsapp text,
  buyer_note text,
  granted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_commercial_intelligence_contact_shares_seller
  on public.commercial_intelligence_contact_shares (seller_user_id, granted_at desc);

create index if not exists idx_commercial_intelligence_contact_shares_buyer
  on public.commercial_intelligence_contact_shares (buyer_user_id, granted_at desc);

create or replace function public.touch_commercial_intelligence_contact_shares_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_commercial_intelligence_contact_shares_updated_at
  on public.commercial_intelligence_contact_shares;
create trigger trigger_touch_commercial_intelligence_contact_shares_updated_at
before update on public.commercial_intelligence_contact_shares
for each row
execute function public.touch_commercial_intelligence_contact_shares_updated_at();

alter table public.commercial_intelligence_contact_shares enable row level security;

drop policy if exists "Users can read own commercial intelligence contact shares" on public.commercial_intelligence_contact_shares;
create policy "Users can read own commercial intelligence contact shares"
on public.commercial_intelligence_contact_shares
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

create or replace function public.list_my_commercial_intelligence_contact_shares()
returns table (
  share_id uuid,
  conversation_id uuid,
  seller_user_id uuid,
  buyer_user_id uuid,
  share_email boolean,
  share_whatsapp boolean,
  shared_email text,
  shared_whatsapp text,
  buyer_note text,
  granted_at timestamptz
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
    shares.id as share_id,
    shares.conversation_id,
    shares.seller_user_id,
    shares.buyer_user_id,
    shares.share_email,
    shares.share_whatsapp,
    shares.shared_email,
    shares.shared_whatsapp,
    shares.buyer_note,
    shares.granted_at
  from public.commercial_intelligence_contact_shares shares
  where shares.seller_user_id = v_user_id
     or shares.buyer_user_id = v_user_id
  order by shares.granted_at desc;
end;
$$;

create or replace function public.grant_commercial_intelligence_contact_share(
  p_conversation_id uuid,
  p_share_email boolean default false,
  p_share_whatsapp boolean default false,
  p_buyer_note text default null
)
returns table (
  share_id uuid,
  seller_notification_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seller_user_id uuid;
  v_buyer_user_id uuid;
  v_status text;
  v_email text;
  v_whatsapp text;
  v_share_id uuid;
  v_notification_id uuid;
begin
  if v_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  if coalesce(p_share_email, false) = false and coalesce(p_share_whatsapp, false) = false then
    raise exception 'Selecione pelo menos um canal para compartilhar.';
  end if;

  select
    conversations.seller_user_id,
    conversations.buyer_user_id,
    conversations.status
  into
    v_seller_user_id,
    v_buyer_user_id,
    v_status
  from public.commercial_intelligence_conversations conversations
  where conversations.id = p_conversation_id
  limit 1;

  if v_buyer_user_id is null or v_buyer_user_id <> v_user_id then
    raise exception 'Conversa mediada nao encontrada para este comprador.';
  end if;

  if v_status <> 'open' then
    raise exception 'A conversa precisa estar aberta para compartilhar contato.';
  end if;

  if exists (
    select 1
    from public.commercial_intelligence_contact_shares shares
    where shares.conversation_id = p_conversation_id
  ) then
    raise exception 'Os contatos ja foram compartilhados para esta conversa.';
  end if;

  select
    nullif(trim(coalesce(users.email, '')), ''),
    nullif(trim(coalesce(users.whatsapp, '')), '')
  into
    v_email,
    v_whatsapp
  from public.users
  where users.id = v_user_id
  limit 1;

  if coalesce(p_share_email, false) = true and v_email is null then
    raise exception 'Seu perfil nao possui e-mail disponivel para compartilhamento.';
  end if;

  if coalesce(p_share_whatsapp, false) = true and v_whatsapp is null then
    raise exception 'Seu perfil nao possui WhatsApp disponivel para compartilhamento.';
  end if;

  insert into public.commercial_intelligence_contact_shares (
    conversation_id,
    seller_user_id,
    buyer_user_id,
    share_email,
    share_whatsapp,
    shared_email,
    shared_whatsapp,
    buyer_note
  )
  values (
    p_conversation_id,
    v_seller_user_id,
    v_user_id,
    coalesce(p_share_email, false),
    coalesce(p_share_whatsapp, false),
    case when coalesce(p_share_email, false) then v_email else null end,
    case when coalesce(p_share_whatsapp, false) then v_whatsapp else null end,
    nullif(trim(coalesce(p_buyer_note, '')), '')
  )
  returning id into v_share_id;

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
    'Comprador autorizou compartilhamento de contato',
    'Um comprador autorizou o compartilhamento de contato nesta conversa mediada. Abra a Inteligencia Comercial para visualizar os canais liberados.',
    '/minha-conta/inteligencia-comercial'
  )
  returning id into v_notification_id;

  return query
  select v_share_id, v_notification_id;
end;
$$;

grant execute on function public.list_my_commercial_intelligence_contact_shares() to authenticated;
grant execute on function public.grant_commercial_intelligence_contact_share(uuid, boolean, boolean, text) to authenticated;
