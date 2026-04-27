create or replace function public.enforce_default_signup_plan_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_default_exists boolean;
  v_switch_in_progress boolean := coalesce(current_setting('app.allow_default_signup_switch', true), '') = 'on';
begin
  if tg_op in ('INSERT', 'UPDATE') then
    if coalesce(new.is_default_signup_plan, false) and coalesce(new.is_downgrade_plan, false) then
      raise exception 'O plano padrao do cadastro nao pode ser o plano de downgrade.';
    end if;

    if coalesce(new.is_default_signup_plan, false) and not coalesce(new.is_active, true) then
      raise exception 'O plano padrao do cadastro precisa permanecer ativo.';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if coalesce(old.is_default_signup_plan, false)
       and (
         coalesce(new.is_default_signup_plan, false) = false
         or coalesce(new.is_active, true) = false
       ) then
      if v_switch_in_progress and coalesce(new.is_default_signup_plan, false) = false then
        return new;
      end if;

      select exists (
        select 1
        from public.plans p
        where p.id <> old.id
          and p.is_default_signup_plan = true
      ) into v_other_default_exists;

      if not v_other_default_exists then
        raise exception 'Precisa existir ao menos um plano padrao no cadastro.';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' and coalesce(old.is_default_signup_plan, false) then
    select exists (
      select 1
      from public.plans p
      where p.id <> old.id
        and p.is_default_signup_plan = true
    ) into v_other_default_exists;

    if not v_other_default_exists then
      raise exception 'Nao e possivel excluir o unico plano padrao do cadastro.';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.set_default_signup_plan(p_plan_id uuid)
returns public.plans
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
begin
  if p_plan_id is null then
    raise exception 'Plano padrao do cadastro nao informado.';
  end if;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id;

  if v_plan.id is null then
    raise exception 'Plano selecionado nao foi encontrado.';
  end if;

  if coalesce(v_plan.is_downgrade_plan, false) then
    raise exception 'O plano padrao do cadastro nao pode ser o plano de downgrade.';
  end if;

  if not coalesce(v_plan.is_active, true) then
    raise exception 'O plano padrao do cadastro precisa permanecer ativo.';
  end if;

  perform set_config('app.allow_default_signup_switch', 'on', true);

  update public.plans
  set is_default_signup_plan = case when id = p_plan_id then true else false end
  where id = p_plan_id
     or is_default_signup_plan = true;

  select *
    into v_plan
  from public.plans
  where id = p_plan_id;

  return v_plan;
end;
$$;

grant execute on function public.set_default_signup_plan(uuid) to authenticated;
