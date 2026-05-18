create table if not exists public.announcement_edit_requests (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  technical_details jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  reviewed_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists announcement_edit_requests_announcement_idx
  on public.announcement_edit_requests (announcement_id, status, created_at desc);

create index if not exists announcement_edit_requests_user_idx
  on public.announcement_edit_requests (user_id, status, created_at desc);

create unique index if not exists announcement_edit_requests_pending_unique
  on public.announcement_edit_requests (announcement_id)
  where status = 'pending';

create or replace function public.touch_announcement_edit_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists announcement_edit_requests_touch_updated_at on public.announcement_edit_requests;
create trigger announcement_edit_requests_touch_updated_at
before update on public.announcement_edit_requests
for each row
execute function public.touch_announcement_edit_requests_updated_at();

create or replace function public.enforce_announcement_edit_request_publication_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_original_status text;
  v_images jsonb := case
    when jsonb_typeof(coalesce(new.payload->'images', '[]'::jsonb)) = 'array' then coalesce(new.payload->'images', '[]'::jsonb)
    else '[]'::jsonb
  end;
begin
  select upper(coalesce(status, ''))
    into v_original_status
  from public.announcements
  where id = new.announcement_id;

  if coalesce(nullif(trim(coalesce(new.payload->>'__original_announcement_status', '')), ''), '') = '' and coalesce(v_original_status, '') <> '' then
    new.payload := jsonb_set(
      coalesce(new.payload, '{}'::jsonb),
      '{__original_announcement_status}',
      to_jsonb(v_original_status),
      true
    );
  end if;

  if new.status <> 'pending' then
    return new;
  end if;

  v_result := public.evaluate_announcement_publication_rules(
    coalesce(new.payload->>'title', ''),
    coalesce(new.payload->>'description', ''),
    coalesce(new.payload->>'category_slug', ''),
    v_images
  );

  if coalesce((v_result->>'blocked')::boolean, false)
    or coalesce((v_result->>'review_required')::boolean, false) then
    update public.announcements
    set
      status = case when upper(coalesce(status, '')) = 'ACTIVE' then 'PENDING' else status end,
      publication_review_severity = 'review',
      publication_review_checked_at = now(),
      publication_review_reasons = coalesce(v_result->'reasons', '[]'::jsonb),
      publication_review_admin_override = false
    where id = new.announcement_id;
  end if;

  return new;
end;
$$;

drop trigger if exists announcement_edit_requests_enforce_publication_rules on public.announcement_edit_requests;
create trigger announcement_edit_requests_enforce_publication_rules
before insert or update of payload, status on public.announcement_edit_requests
for each row
execute function public.enforce_announcement_edit_request_publication_rules();

alter table public.announcement_edit_requests enable row level security;

drop policy if exists "Users can view own announcement edit requests" on public.announcement_edit_requests;
create policy "Users can view own announcement edit requests"
on public.announcement_edit_requests
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can create own announcement edit requests" on public.announcement_edit_requests;
create policy "Users can create own announcement edit requests"
on public.announcement_edit_requests
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own pending announcement edit requests" on public.announcement_edit_requests;
create policy "Users can update own pending announcement edit requests"
on public.announcement_edit_requests
for update
to authenticated
using (auth.uid() = user_id and status = 'pending')
with check (auth.uid() = user_id);

drop policy if exists "Admins can view all announcement edit requests" on public.announcement_edit_requests;
create policy "Admins can view all announcement edit requests"
on public.announcement_edit_requests
for select
to authenticated
using (public.is_admin() = true);

drop policy if exists "Admins can update all announcement edit requests" on public.announcement_edit_requests;
create policy "Admins can update all announcement edit requests"
on public.announcement_edit_requests
for update
to authenticated
using (public.is_admin() = true)
with check (public.is_admin() = true);
