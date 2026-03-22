alter table public.layout_settings
  add column if not exists facebook_url text,
  add column if not exists instagram_url text,
  add column if not exists youtube_url text,
  add column if not exists linkedin_url text,
  add column if not exists whatsapp_url text,
  add column if not exists tiktok_url text;
