insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'seller-stores',
  'seller-stores',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

drop policy if exists "Seller stores public read" on storage.objects;
create policy "Seller stores public read"
on storage.objects
for select
to public
using (bucket_id = 'seller-stores');

drop policy if exists "Users can upload seller store assets" on storage.objects;
create policy "Users can upload seller store assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'seller-stores'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can update seller store assets" on storage.objects;
create policy "Users can update seller store assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'seller-stores'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'seller-stores'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete seller store assets" on storage.objects;
create policy "Users can delete seller store assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'seller-stores'
  and (storage.foldername(name))[1] = auth.uid()::text
);
