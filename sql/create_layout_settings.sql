create table if not exists public.layout_settings (
  id uuid primary key default gen_random_uuid(),
  site_name text not null default 'BWAGRO',
  site_short_name text,
  site_tagline text,
  header_brand_text text,
  footer_brand_text text,
  login_brand_text text,
  seo_title text,
  seo_description text,
  logo_url text,
  logo_light_url text,
  logo_dark_url text,
  favicon_url text,
  primary_color text not null default '#16a34a',
  secondary_color text not null default '#0f172a',
  accent_color text not null default '#f59e0b',
  background_color text not null default '#f8fafc',
  surface_color text not null default '#ffffff',
  text_color text not null default '#0f172a',
  muted_text_color text not null default '#64748b',
  success_color text not null default '#16a34a',
  warning_color text not null default '#f59e0b',
  error_color text not null default '#dc2626',
  last_updated_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists layout_settings_singleton_idx on public.layout_settings ((true));

insert into public.layout_settings (
  site_name,
  site_short_name,
  site_tagline,
  header_brand_text,
  footer_brand_text,
  login_brand_text,
  seo_title,
  seo_description
)
select
  'BWAGRO',
  'BWAGRO',
  'Conectando o agro com tecnologia e mercado.',
  'BWAGRO',
  'BWAGRO Marketplace',
  'BWAGRO',
  'BWAGRO',
  'Marketplace do agronegocio brasileiro.'
where not exists (
  select 1 from public.layout_settings
);
