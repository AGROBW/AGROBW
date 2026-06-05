drop view if exists public.chats_full cascade;

create or replace view public.chats_full as
select
  c.id,
  c.announcement_id,
  c.seller_id,
  c.buyer_id,
  c.status,
  c.created_at,
  c.last_message,
  c.last_message_time,
  c.unread_count_buyer,
  c.unread_count_seller,
  case
    when auth.uid() = c.buyer_id then c.unread_count_buyer
    when auth.uid() = c.seller_id then c.unread_count_seller
    else 0
  end as unread_count,
  a.title as ad_title,
  a.price as ad_price,
  a.images[1] as ad_image,
  a.status as announcement_status,
  a.expires_at as announcement_expires_at,
  a.expired_at as announcement_expired_at,
  a.deletion_scheduled_at as announcement_deletion_scheduled_at,
  l.contact_expires_at as lead_contact_expires_at,
  seller.name as seller_name,
  buyer.name as buyer_name
from public.chats c
left join public.announcements a on c.announcement_id = a.id
left join public.leads l on l.chat_id = c.id
left join public.users seller on c.seller_id = seller.id
left join public.users buyer on c.buyer_id = buyer.id;

grant select on public.chats_full to authenticated;

comment on view public.chats_full is
  'View consolidada dos chats com contadores de nao lidas por usuario e metadados do anuncio.';
