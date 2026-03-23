create table if not exists public.news_social_settings (
  id uuid primary key default gen_random_uuid(),
  instagram_enabled boolean not null default false,
  instagram_username text,
  instagram_business_account_id text,
  instagram_access_token text,
  meta_user_access_token text,
  facebook_page_id text,
  facebook_page_name text,
  facebook_page_access_token text,
  instagram_connection_status text not null default 'disconnected'
    check (instagram_connection_status in ('disconnected', 'connected', 'expiring_soon', 'expired', 'error')),
  instagram_connected_at timestamptz,
  instagram_token_expires_at timestamptz,
  instagram_token_last_validated_at timestamptz,
  default_instagram_story_image_url text,
  default_instagram_story_image_path text,
  linkedin_enabled boolean not null default false,
  linkedin_profile_type text not null default 'organization'
    check (linkedin_profile_type in ('member', 'organization')),
  linkedin_profile_label text,
  linkedin_author_urn text,
  linkedin_access_token text,
  default_linkedin_image_url text,
  default_linkedin_image_path text,
  auto_publish_instagram_story boolean not null default false,
  auto_publish_linkedin_post boolean not null default true,
  instagram_story_template text,
  linkedin_post_template text,
  article_url_base text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists news_social_settings_singleton_idx
  on public.news_social_settings ((true));

insert into public.news_social_settings (
  instagram_enabled,
  linkedin_enabled,
  linkedin_profile_type,
  auto_publish_instagram_story,
  auto_publish_linkedin_post,
  instagram_story_template,
  linkedin_post_template
)
select
  false,
  false,
  'organization',
  false,
  true,
  'Nova matéria publicada na AGRO BW: {{title}}. Leia no site: {{url}}',
  'Nova matéria na AGRO BW: {{title}}\n\n{{summary}}\n\nLeia a notícia completa: {{url}}'
where not exists (
  select 1 from public.news_social_settings
);

create table if not exists public.news_social_publications (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  platform text not null check (platform in ('instagram', 'linkedin')),
  publication_type text not null check (publication_type in ('story', 'post')),
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'published', 'failed', 'disabled')),
  target_label text,
  article_title text,
  article_slug text,
  external_publication_id text,
  external_publication_url text,
  caption text,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_news_social_publications_article_platform
  on public.news_social_publications(article_id, platform);

create index if not exists idx_news_social_publications_status
  on public.news_social_publications(status, created_at desc);

alter table public.news_social_settings enable row level security;
alter table public.news_social_publications enable row level security;

drop policy if exists "Admins can manage news social settings" on public.news_social_settings;
create policy "Admins can manage news social settings"
  on public.news_social_settings
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Admins can manage news social publications" on public.news_social_publications;
create policy "Admins can manage news social publications"
  on public.news_social_publications
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);
