-- Impede que o plano inicial (Start) seja reutilizado depois de consumido.
-- Regra de produto: Start e apenas o beneficio inicial do cadastro.

alter table public.users
  add column if not exists start_plan_consumed_at timestamptz;

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
        or lower(trim(coalesce(p.name, ''))) in ('start', 'start agro', 'safra')
      )
  );
$$;

create or replace function public.mark_start_plan_consumed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_start_signup_plan(new.plan_id) then
    update public.users
    set start_plan_consumed_at = coalesce(start_plan_consumed_at, now())
    where id = new.user_id;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_start_plan_reuse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_consumed_at timestamptz;
begin
  if not public.is_start_signup_plan(new.plan_id) then
    return new;
  end if;

  -- Atualizacoes da propria assinatura Start continuam permitidas
  -- para expiracao, auditoria e manutencao. O bloqueio e somente para
  -- criar uma nova assinatura Start ou trocar outro plano para Start.
  if tg_op = 'UPDATE' and old.plan_id = new.plan_id then
    return new;
  end if;

  select u.start_plan_consumed_at
    into v_start_consumed_at
  from public.users u
  where u.id = new.user_id;

  if v_start_consumed_at is not null then
    raise exception 'Plano Start disponivel apenas uma vez por usuario.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_prevent_start_plan_reuse on public.user_subscriptions;
create trigger trg_prevent_start_plan_reuse
before insert or update of plan_id on public.user_subscriptions
for each row
execute function public.prevent_start_plan_reuse();

drop trigger if exists trg_mark_start_plan_consumed on public.user_subscriptions;
create trigger trg_mark_start_plan_consumed
after insert or update of plan_id on public.user_subscriptions
for each row
execute function public.mark_start_plan_consumed();

-- Backfill: usuarios que ja tiveram Start no historico nao podem voltar para ele.
update public.users u
set start_plan_consumed_at = coalesce(u.start_plan_consumed_at, first_start.first_start_at)
from (
  select
    us.user_id,
    min(coalesce(us.created_at, us.current_period_start, now())) as first_start_at
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where p.is_default_signup_plan = true
     or lower(trim(coalesce(p.name, ''))) in ('start', 'start agro', 'safra')
  group by us.user_id
) first_start
where first_start.user_id = u.id
  and u.start_plan_consumed_at is null;

grant execute on function public.is_start_signup_plan(uuid) to authenticated;
