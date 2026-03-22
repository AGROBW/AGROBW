insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'news_social_assets',
  'news_social_assets',
  true,
  8388608,
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

drop policy if exists "News social assets public read" on storage.objects;
create policy "News social assets public read"
on storage.objects
for select
to public
using (bucket_id = 'news_social_assets');

drop policy if exists "Admins can upload news social assets" on storage.objects;
create policy "Admins can upload news social assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'news_social_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
);

drop policy if exists "Admins can update news social assets" on storage.objects;
create policy "Admins can update news social assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'news_social_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
)
with check (
  bucket_id = 'news_social_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
);

drop policy if exists "Admins can delete news social assets" on storage.objects;
create policy "Admins can delete news social assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'news_social_assets'
  and exists (
    select 1
    from public.users
    where id = auth.uid()
      and is_admin = true
  )
);
