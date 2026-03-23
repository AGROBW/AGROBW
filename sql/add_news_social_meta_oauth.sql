alter table public.news_social_settings
  add column if not exists meta_user_access_token text,
  add column if not exists facebook_page_id text,
  add column if not exists facebook_page_name text,
  add column if not exists facebook_page_access_token text,
  add column if not exists instagram_connection_status text default 'disconnected'
    check (instagram_connection_status in ('disconnected', 'connected', 'expiring_soon', 'expired', 'error')),
  add column if not exists instagram_connected_at timestamptz,
  add column if not exists instagram_token_expires_at timestamptz,
  add column if not exists instagram_token_last_validated_at timestamptz;

update public.news_social_settings
set instagram_connection_status = case
  when coalesce(instagram_business_account_id, '') <> '' and coalesce(instagram_access_token, '') <> '' then 'connected'
  else 'disconnected'
end
where instagram_connection_status is null;
