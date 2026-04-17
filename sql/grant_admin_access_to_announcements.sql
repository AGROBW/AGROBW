alter table public.announcements enable row level security;

drop policy if exists "Admins podem ver todos os anuncios" on public.announcements;
drop policy if exists "Admins podem editar qualquer anuncio" on public.announcements;
drop policy if exists "Admins podem deletar qualquer anuncio" on public.announcements;
drop policy if exists "admins_select_announcements" on public.announcements;
drop policy if exists "admins_update_announcements" on public.announcements;
drop policy if exists "admins_delete_announcements" on public.announcements;

create policy "admins_select_announcements"
  on public.announcements
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

create policy "admins_update_announcements"
  on public.announcements
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

create policy "admins_delete_announcements"
  on public.announcements
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
