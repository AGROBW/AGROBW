begin;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or lower(coalesce(u.role, '')) = 'admin')
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;

comment on function public.is_admin() is
'Permite acesso administrativo somente para usuarios admin autenticados com MFA em AAL2.';

grant execute on function public.is_admin() to authenticated;

create or replace function public.site_analytics_is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and (coalesce(u.is_admin, false) = true or lower(coalesce(u.role, '')) = 'admin')
      and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );
$$;

comment on function public.site_analytics_is_admin() is
'Permite acesso ao analytics administrativo somente para sessoes admin com MFA em AAL2.';

grant execute on function public.site_analytics_is_admin() to authenticated;

commit;
