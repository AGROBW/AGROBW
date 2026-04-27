alter table public.user_subscriptions
  add column if not exists billing_cycle text,
  add column if not exists amount_paid numeric(10, 2),
  add column if not exists currency text,
  add column if not exists current_period_start timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean,
  add column if not exists trial_end_date timestamptz,
  add column if not exists created_at timestamptz,
  add column if not exists updated_at timestamptz;

do $$
declare
  has_starts_at boolean;
  has_expires_at boolean;
  has_amount_paid boolean;
  start_expr text;
  end_expr text;
  trial_expr text;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_subscriptions'
      and column_name = 'starts_at'
  ) into has_starts_at;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_subscriptions'
      and column_name = 'amount_paid'
  ) into has_amount_paid;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_subscriptions'
      and column_name = 'expires_at'
  ) into has_expires_at;

  start_expr := case
    when has_starts_at then 'coalesce(current_period_start, starts_at, created_at, now())'
    else 'coalesce(current_period_start, created_at, now())'
  end;

  end_expr := case
    when has_expires_at and has_starts_at then 'coalesce(current_period_end, expires_at, starts_at, created_at, now())'
    when has_expires_at then 'coalesce(current_period_end, expires_at, created_at, now())'
    when has_starts_at then 'coalesce(current_period_end, starts_at, created_at, now())'
    else 'coalesce(current_period_end, created_at, now())'
  end;

  trial_expr := case
    when has_amount_paid then
      format(
        'coalesce(trial_end_date, case when coalesce(amount_paid, 0) > 0 then null else %s end)',
        end_expr
      )
    else
      format('coalesce(trial_end_date, %s)', end_expr)
  end;

  execute format(
    $sql$
      update public.user_subscriptions
      set
        billing_cycle = coalesce(
          nullif(billing_cycle, ''),
          'monthly'
        ),
        current_period_start = %1$s,
        current_period_end = %2$s,
        cancel_at_period_end = coalesce(cancel_at_period_end, false),
        trial_end_date = %3$s
    $sql$,
    start_expr,
    end_expr,
    trial_expr
  );
end $$;

alter table public.user_subscriptions
  alter column billing_cycle set default 'monthly';

update public.user_subscriptions
set amount_paid = coalesce(amount_paid, 0)
where amount_paid is null;

update public.user_subscriptions
set currency = coalesce(nullif(currency, ''), 'BRL')
where currency is null
   or currency = '';

update public.user_subscriptions
set created_at = coalesce(created_at, now())
where created_at is null;

update public.user_subscriptions
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.user_subscriptions
  alter column amount_paid set default 0,
  alter column currency set default 'BRL',
  alter column created_at set default now(),
  alter column updated_at set default now();

update public.user_subscriptions
set billing_cycle = 'monthly'
where billing_cycle is null
   or billing_cycle not in ('monthly', 'yearly');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_subscriptions_billing_cycle_check'
  ) then
    alter table public.user_subscriptions
      add constraint user_subscriptions_billing_cycle_check
      check (billing_cycle in ('monthly', 'yearly'));
  end if;
end $$;

alter table public.user_subscriptions
  alter column billing_cycle set not null,
  alter column amount_paid set not null;

create index if not exists idx_user_subscriptions_current_period_end
  on public.user_subscriptions (current_period_end desc);
