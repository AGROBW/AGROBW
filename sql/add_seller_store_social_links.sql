alter table public.seller_stores
  add column if not exists facebook_url text,
  add column if not exists linkedin_url text;
