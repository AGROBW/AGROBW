insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'announcement-videos',
  'announcement-videos',
  true,
  104857600,
  array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

drop policy if exists "Announcement videos public read" on storage.objects;
create policy "Announcement videos public read"
on storage.objects
for select
to public
using (bucket_id = 'announcement-videos');

drop policy if exists "Store users can upload announcement videos" on storage.objects;
create policy "Store users can upload announcement videos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'announcement-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = auth.uid()
      and us.status = 'active'
      and coalesce(us.current_period_end, now() + interval '100 years') > now()
      and p.has_seller_store = true
  )
);

drop policy if exists "Store users can update announcement videos" on storage.objects;
create policy "Store users can update announcement videos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'announcement-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'announcement-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = auth.uid()
      and us.status = 'active'
      and coalesce(us.current_period_end, now() + interval '100 years') > now()
      and p.has_seller_store = true
  )
);

drop policy if exists "Store users can delete announcement videos" on storage.objects;
create policy "Store users can delete announcement videos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'announcement-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
