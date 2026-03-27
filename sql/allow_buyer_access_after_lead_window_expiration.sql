create or replace function public.block_messages_for_expired_announcements()
returns trigger
language plpgsql
as $$
declare
  target_status text;
  target_contact_expires_at timestamptz;
  target_seller_id uuid;
begin
  select
    a.status,
    l.contact_expires_at,
    c.seller_id
  into target_status, target_contact_expires_at, target_seller_id
  from public.chats c
  join public.announcements a on a.id = c.announcement_id
  left join public.leads l on l.chat_id = c.id
  where c.id = new.chat_id
  limit 1;

  if target_status = 'EXPIRED' then
    raise exception 'Anuncio expirado';
  end if;

  if target_contact_expires_at is not null
     and target_contact_expires_at <= now()
     and new.sender_id = target_seller_id then
    raise exception 'Prazo de contato do lead expirado';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_block_messages_for_expired_announcements on public.messages;

create trigger trg_block_messages_for_expired_announcements
before insert on public.messages
for each row
execute function public.block_messages_for_expired_announcements();
