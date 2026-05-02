create or replace function public.is_start_signup_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.plans p
    where p.id = p_plan_id
      and (
        p.is_default_signup_plan = true
        or (
          not exists (
            select 1
            from public.plans configured_default
            where configured_default.is_default_signup_plan = true
          )
          and lower(trim(coalesce(p.name, ''))) in ('start', 'start agro', 'safra')
        )
      )
  );
$$;

grant execute on function public.is_start_signup_plan(uuid) to authenticated;
