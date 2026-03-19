insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fiscal_documents',
  'fiscal_documents',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf'];

drop policy if exists "Admins can upload fiscal documents" on storage.objects;
create policy "Admins can upload fiscal documents"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'fiscal_documents'
  and public.is_admin() = true
);

drop policy if exists "Admins can update fiscal documents" on storage.objects;
create policy "Admins can update fiscal documents"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'fiscal_documents'
  and public.is_admin() = true
)
with check (
  bucket_id = 'fiscal_documents'
  and public.is_admin() = true
);

drop policy if exists "Admins can delete fiscal documents" on storage.objects;
create policy "Admins can delete fiscal documents"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'fiscal_documents'
  and public.is_admin() = true
);

drop policy if exists "Admins can read fiscal documents" on storage.objects;
create policy "Admins can read fiscal documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fiscal_documents'
  and public.is_admin() = true
);

drop policy if exists "Users can read own fiscal documents" on storage.objects;
create policy "Users can read own fiscal documents"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'fiscal_documents'
  and exists (
    select 1
    from public.payments
    where payments.invoice_storage_path = storage.objects.name
      and payments.user_id = auth.uid()
  )
);
