insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'layout_assets',
  'layout_assets',
  true,
  5242880,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'];

drop policy if exists "Layout assets public read" on storage.objects;
create policy "Layout assets public read"
on storage.objects
for select
to public
using (bucket_id = 'layout_assets');

drop policy if exists "Admins can upload layout assets" on storage.objects;
create policy "Admins can upload layout assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'layout_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
);

drop policy if exists "Admins can update layout assets" on storage.objects;
create policy "Admins can update layout assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'layout_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
)
with check (
  bucket_id = 'layout_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
);

drop policy if exists "Admins can delete layout assets" on storage.objects;
create policy "Admins can delete layout assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'layout_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
);
