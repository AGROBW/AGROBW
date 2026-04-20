create table if not exists public.support_settings (
  id text primary key default 'default',
  card_title text not null default 'Atendimento',
  average_response_label text not null default 'Resposta média',
  average_response_value text not null default '< 24h',
  schedule_label text not null default 'Horário',
  schedule_days text not null default 'Seg-Sex',
  schedule_time_label text not null default 'Das',
  schedule_time text not null default '08h às 18h',
  is_online boolean not null default true,
  online_status_text text not null default 'Suporte online agora',
  offline_status_text text not null default 'Suporte offline no momento',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.support_settings (
  id,
  card_title,
  average_response_label,
  average_response_value,
  schedule_label,
  schedule_days,
  schedule_time_label,
  schedule_time,
  is_online,
  online_status_text,
  offline_status_text
) values (
  'default',
  'Atendimento',
  'Resposta média',
  '< 24h',
  'Horário',
  'Seg-Sex',
  'Das',
  '08h às 18h',
  true,
  'Suporte online agora',
  'Suporte offline no momento'
) on conflict (id) do nothing;

create or replace function public.set_support_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_support_settings_updated_at on public.support_settings;

create trigger trg_set_support_settings_updated_at
before update on public.support_settings
for each row
execute function public.set_support_settings_updated_at();

alter table public.support_settings enable row level security;

drop policy if exists "Authenticated users can read support settings" on public.support_settings;
create policy "Authenticated users can read support settings"
on public.support_settings
for select
to authenticated
using (true);

drop policy if exists "Admins can insert support settings" on public.support_settings;
create policy "Admins can insert support settings"
on public.support_settings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin, false) = true
  )
);

drop policy if exists "Admins can update support settings" on public.support_settings;
create policy "Admins can update support settings"
on public.support_settings
for update
to authenticated
using (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin, false) = true
  )
)
with check (
  exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin, false) = true
  )
);

grant select on public.support_settings to authenticated;
grant insert, update on public.support_settings to authenticated;
