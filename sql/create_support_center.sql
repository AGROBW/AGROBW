create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  category text not null check (category in ('announcements', 'billing', 'plans', 'messages', 'technical', 'other')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  description text,
  assigned_admin_id uuid references public.users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'admin')),
  sender_user_id uuid references public.users(id) on delete set null,
  sender_admin_id uuid references public.users(id) on delete set null,
  sender_name text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_user_id_idx on public.support_tickets(user_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);
create index if not exists support_tickets_last_message_at_idx on public.support_tickets(last_message_at desc);
create index if not exists support_ticket_messages_ticket_id_idx on public.support_ticket_messages(ticket_id, created_at asc);

create or replace function public.set_support_ticket_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_support_ticket_updated_at on public.support_tickets;

create trigger trg_set_support_ticket_updated_at
before update on public.support_tickets
for each row
execute function public.set_support_ticket_updated_at();

create or replace function public.sync_support_ticket_last_message_at()
returns trigger
language plpgsql
as $$
begin
  update public.support_tickets
  set
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.ticket_id;

  return new;
end;
$$;

drop trigger if exists trg_sync_support_ticket_last_message_at on public.support_ticket_messages;

create trigger trg_sync_support_ticket_last_message_at
after insert on public.support_ticket_messages
for each row
execute function public.sync_support_ticket_last_message_at();

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists "Users can view own support tickets" on public.support_tickets;
create policy "Users can view own support tickets"
on public.support_tickets
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and coalesce(u.is_admin, false) = true
  )
);

drop policy if exists "Users can create own support tickets" on public.support_tickets;
create policy "Users can create own support tickets"
on public.support_tickets
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Admins can update support tickets" on public.support_tickets;
create policy "Admins can update support tickets"
on public.support_tickets
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

drop policy if exists "Users can view own support messages" on public.support_ticket_messages;
create policy "Users can view own support messages"
on public.support_ticket_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and (
        t.user_id = auth.uid()
        or exists (
          select 1
          from public.users u
          where u.id = auth.uid()
            and coalesce(u.is_admin, false) = true
        )
      )
  )
);

drop policy if exists "Users can create own support messages" on public.support_ticket_messages;
create policy "Users can create own support messages"
on public.support_ticket_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.support_tickets t
    where t.id = support_ticket_messages.ticket_id
      and (
        (
          t.user_id = auth.uid()
          and sender_type = 'user'
          and sender_user_id = auth.uid()
        )
        or (
          exists (
            select 1
            from public.users u
            where u.id = auth.uid()
              and coalesce(u.is_admin, false) = true
          )
          and sender_type = 'admin'
          and sender_admin_id = auth.uid()
        )
      )
  )
);

grant select, insert, update on public.support_tickets to authenticated;
grant select, insert on public.support_ticket_messages to authenticated;
