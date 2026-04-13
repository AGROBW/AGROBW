create table if not exists public.smtp_settings (
  id text primary key default 'smtp_config_1',
  host text not null default '',
  port integer not null default 587,
  user_name text not null default '',
  password text not null default '',
  encryption text not null default 'TLS'
    check (encryption in ('SSL', 'TLS', 'NONE')),
  from_email text not null default '',
  from_name text not null default 'AGRO BW',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.smtp_settings (id)
values ('smtp_config_1')
on conflict (id) do nothing;

create or replace function public.touch_smtp_settings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_smtp_settings_updated_at on public.smtp_settings;
create trigger trigger_touch_smtp_settings_updated_at
before update on public.smtp_settings
for each row
execute function public.touch_smtp_settings_updated_at();

alter table public.smtp_settings enable row level security;

drop policy if exists "Admins can manage smtp settings" on public.smtp_settings;
create policy "Admins can manage smtp settings"
on public.smtp_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

comment on table public.smtp_settings is
'Configuracao SMTP centralizada do painel administrativo, usada pelas edge functions de e-mail.';
