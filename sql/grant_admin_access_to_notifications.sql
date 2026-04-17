alter table public.notifications enable row level security;

drop policy if exists "admins_select_notifications" on public.notifications;
drop policy if exists "admins_insert_notifications" on public.notifications;
drop policy if exists "admins_update_notifications" on public.notifications;
drop policy if exists "admins_delete_notifications" on public.notifications;

create policy "admins_select_notifications"
  on public.notifications
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and (
          users.is_admin = true
          or upper(coalesce(users.role, '')) = 'ADMIN'
        )
    )
  );

create policy "admins_insert_notifications"
  on public.notifications
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and (
          users.is_admin = true
          or upper(coalesce(users.role, '')) = 'ADMIN'
        )
    )
  );

create policy "admins_update_notifications"
  on public.notifications
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and (
          users.is_admin = true
          or upper(coalesce(users.role, '')) = 'ADMIN'
        )
    )
  )
  with check (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and (
          users.is_admin = true
          or upper(coalesce(users.role, '')) = 'ADMIN'
        )
    )
  );

create policy "admins_delete_notifications"
  on public.notifications
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.users
      where users.id = auth.uid()
        and (
          users.is_admin = true
          or upper(coalesce(users.role, '')) = 'ADMIN'
        )
    )
  );
