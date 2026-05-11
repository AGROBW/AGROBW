create table if not exists public.site_popup_user_states (
  popup_id uuid not null references public.site_popups(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  dismissed_at timestamptz,
  clicked_at timestamptz,
  seen_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (popup_id, user_id)
);

create index if not exists idx_site_popup_user_states_user_id
  on public.site_popup_user_states (user_id, updated_at desc);

alter table public.site_popup_user_states enable row level security;

drop policy if exists "Users can view own site popup states" on public.site_popup_user_states;
create policy "Users can view own site popup states"
  on public.site_popup_user_states
  for select
  using (auth.uid() = user_id or public.is_admin() = true);

drop policy if exists "Users can insert own site popup states" on public.site_popup_user_states;
create policy "Users can insert own site popup states"
  on public.site_popup_user_states
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own site popup states" on public.site_popup_user_states;
create policy "Users can update own site popup states"
  on public.site_popup_user_states
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
