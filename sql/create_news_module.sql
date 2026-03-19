create extension if not exists pgcrypto;

create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  domain text not null unique,
  notes text,
  is_active boolean not null default true,
  capture_type text not null default 'manual_url'
    check (capture_type in ('manual_url', 'scraping', 'api', 'rss')),
  usage_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_ingestions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources(id) on delete set null,
  source_url text not null,
  original_title text,
  original_portal_name text,
  original_published_at timestamptz,
  original_author text,
  featured_image_url text,
  extracted_text text,
  extracted_metadata jsonb not null default '{}'::jsonb,
  capture_status text not null default 'pending'
    check (capture_status in ('pending', 'captured', 'failed')),
  capture_error text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  ingestion_id uuid references public.news_ingestions(id) on delete set null,
  legacy_news_id uuid references public.news(id) on delete set null,
  title text not null,
  subtitle text,
  summary text,
  content text,
  agro_impact text,
  references_block text,
  slug text not null unique,
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'published', 'archived')),
  featured_image_url text,
  featured_image_path text,
  published_at timestamptz,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_article_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.news_articles(id) on delete cascade,
  source_id uuid references public.news_sources(id) on delete set null,
  source_url text not null,
  portal_name text,
  original_title text,
  original_published_at timestamptz,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.news_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.news_articles(id) on delete cascade,
  ingestion_id uuid references public.news_ingestions(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'completed', 'failed')),
  prompt_snapshot text,
  model text,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.news_settings (
  id uuid primary key default gen_random_uuid(),
  default_prompt text not null default 'Reescreva a materia com foco no agronegocio brasileiro, tom jornalistico profissional e sem copiar frases da fonte.',
  max_extracted_characters integer not null default 12000,
  summary_rule text not null default 'Gerar resumo em ate 320 caracteres.',
  show_agro_impact boolean not null default true,
  references_template text not null default 'Fonte original consultada: {{portal_name}} | {{source_url}} | Publicado em {{original_published_at}}',
  default_generated_status text not null default 'draft'
    check (default_generated_status in ('draft', 'in_review', 'published', 'archived')),
  openai_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.news_settings (default_prompt)
select 'Reescreva a materia com foco no agronegocio brasileiro, tom jornalistico profissional e sem copiar frases da fonte.'
where not exists (select 1 from public.news_settings);

create index if not exists idx_news_articles_status_published_at
  on public.news_articles(status, published_at desc nulls last);

create index if not exists idx_news_ingestions_capture_status
  on public.news_ingestions(capture_status, created_at desc);

create index if not exists idx_news_article_sources_article
  on public.news_article_sources(article_id, display_order);

create index if not exists idx_news_generation_jobs_status
  on public.news_generation_jobs(status, created_at desc);

alter table public.news_sources enable row level security;
alter table public.news_ingestions enable row level security;
alter table public.news_articles enable row level security;
alter table public.news_article_sources enable row level security;
alter table public.news_generation_jobs enable row level security;
alter table public.news_settings enable row level security;

drop policy if exists "Public can read published news articles" on public.news_articles;
create policy "Public can read published news articles"
  on public.news_articles
  for select
  using (status = 'published');

drop policy if exists "Public can read news article sources for published articles" on public.news_article_sources;
create policy "Public can read news article sources for published articles"
  on public.news_article_sources
  for select
  using (
    exists (
      select 1
      from public.news_articles a
      where a.id = article_id
        and a.status = 'published'
    )
  );

drop policy if exists "Admins can manage news sources" on public.news_sources;
create policy "Admins can manage news sources"
  on public.news_sources
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Admins can manage news ingestions" on public.news_ingestions;
create policy "Admins can manage news ingestions"
  on public.news_ingestions
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Admins can manage news articles" on public.news_articles;
create policy "Admins can manage news articles"
  on public.news_articles
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Admins can manage news article sources" on public.news_article_sources;
create policy "Admins can manage news article sources"
  on public.news_article_sources
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Admins can manage news generation jobs" on public.news_generation_jobs;
create policy "Admins can manage news generation jobs"
  on public.news_generation_jobs
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

drop policy if exists "Admins can manage news settings" on public.news_settings;
create policy "Admins can manage news settings"
  on public.news_settings
  for all
  to authenticated
  using (public.is_admin() = true)
  with check (public.is_admin() = true);
