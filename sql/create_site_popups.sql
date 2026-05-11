create table if not exists public.site_popups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  message text not null,
  support_text text,
  primary_button_label text not null default 'Criar minha conta',
  primary_button_link text not null default '/cadastro',
  delay_seconds integer not null default 5 check (delay_seconds >= 0 and delay_seconds <= 120),
  is_active boolean not null default false,
  show_once boolean not null default true,
  audience text not null default 'visitors' check (audience in ('visitors', 'authenticated', 'all')),
  page_scope text not null default 'site' check (page_scope in ('site', 'home')),
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_site_popups_active_updated_at
  on public.site_popups (is_active, updated_at desc);

alter table public.site_popups enable row level security;

drop policy if exists "Public can view active site popups" on public.site_popups;
create policy "Public can view active site popups"
  on public.site_popups
  for select
  using (is_active = true or public.is_admin() = true);

drop policy if exists "Admins can manage site popups" on public.site_popups;
create policy "Admins can manage site popups"
  on public.site_popups
  using (public.is_admin() = true)
  with check (public.is_admin() = true);

comment on table public.site_popups is
  'Campanhas de pop-up exibidas no site, controladas pelo painel administrativo.';
