create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid references public.users(id) on delete set null,
  name text not null,
  email text not null,
  phone text,
  subject text,
  message text not null,
  recipient_email text,
  source_page text not null default 'contact_page',
  status text not null default 'new'
    check (status in ('new', 'in_progress', 'resolved', 'archived')),
  admin_notes text,
  handled_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contact_messages_status_created_at
  on public.contact_messages (status, created_at desc);

create index if not exists idx_contact_messages_email_created_at
  on public.contact_messages (email, created_at desc);

create index if not exists idx_contact_messages_requester_user_id
  on public.contact_messages (requester_user_id);

create or replace function public.touch_contact_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trigger_touch_contact_messages_updated_at on public.contact_messages;
create trigger trigger_touch_contact_messages_updated_at
before update on public.contact_messages
for each row
execute function public.touch_contact_messages_updated_at();

alter table public.contact_messages enable row level security;

drop policy if exists "Admins can manage contact messages" on public.contact_messages;
create policy "Admins can manage contact messages"
on public.contact_messages
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

drop function if exists public.submit_contact_message(text, text, text, text, text);
create or replace function public.submit_contact_message(
  p_name text,
  p_email text,
  p_phone text default null,
  p_subject text default null,
  p_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_recipient_email text;
  v_requester_user_id uuid := auth.uid();
begin
  if coalesce(nullif(trim(p_name), ''), '') = '' then
    raise exception 'Informe seu nome.';
  end if;

  if coalesce(nullif(trim(p_email), ''), '') = '' then
    raise exception 'Informe seu e-mail.';
  end if;

  if position('@' in trim(p_email)) = 0 then
    raise exception 'Informe um e-mail valido.';
  end if;

  if coalesce(nullif(trim(p_message), ''), '') = '' then
    raise exception 'Informe sua mensagem.';
  end if;

  select c.form_recipient_email
  into v_recipient_email
  from public.contact_page_content c
  where c.id = '00000000-0000-0000-0000-000000000004';

  insert into public.contact_messages (
    requester_user_id,
    name,
    email,
    phone,
    subject,
    message,
    recipient_email
  )
  values (
    v_requester_user_id,
    trim(p_name),
    trim(lower(p_email)),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    trim(p_message),
    nullif(trim(coalesce(v_recipient_email, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_contact_message(text, text, text, text, text) to anon;
grant execute on function public.submit_contact_message(text, text, text, text, text) to authenticated;

comment on table public.contact_messages is
'Mensagens enviadas pelo formulario publico da pagina Fale Conosco.';

comment on function public.submit_contact_message(text, text, text, text, text) is
'Recebe uma mensagem publica da pagina Fale Conosco e registra na caixa de entrada administrativa.';
