alter table public.users
  add column if not exists document_review_status text,
  add column if not exists document_review_notes text,
  add column if not exists document_reviewed_at timestamptz,
  add column if not exists document_reviewed_by uuid references public.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_document_review_status_check'
  ) then
    alter table public.users
      add constraint users_document_review_status_check
      check (document_review_status in ('not_submitted', 'pending', 'approved', 'rejected'));
  end if;
end $$;

update public.users
set document_review_status = case
  when document_path is null then 'not_submitted'
  when document_verified is true then 'approved'
  when document_review_status = 'rejected' then 'rejected'
  else 'pending'
end
where document_review_status is null;

alter table public.users
  alter column document_review_status set default 'not_submitted';

create index if not exists idx_users_document_review_status
  on public.users (document_review_status);
