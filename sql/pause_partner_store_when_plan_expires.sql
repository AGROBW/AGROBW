alter table public.seller_stores
  add column if not exists is_paused_due_to_plan boolean not null default false;

create index if not exists idx_seller_stores_paused_due_to_plan
  on public.seller_stores(is_paused_due_to_plan);

create or replace function public.sync_seller_store_feature_status(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_store_feature boolean := false;
begin
  if p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = p_user_id
      and us.status = 'active'
      and us.current_period_end > now()
      and coalesce(p.has_seller_store, false) = true
  ) into v_has_store_feature;

  update public.seller_stores
  set
    is_store_feature_enabled = v_has_store_feature,
    is_paused_due_to_plan = not v_has_store_feature,
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;
end;
$$;

create or replace function public.handle_seller_store_initial_feature_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_store_feature boolean := false;
begin
  select exists (
    select 1
    from public.user_subscriptions us
    join public.plans p on p.id = us.plan_id
    where us.user_id = new.user_id
      and us.status = 'active'
      and us.current_period_end > now()
      and coalesce(p.has_seller_store, false) = true
  ) into v_has_store_feature;

  new.is_store_feature_enabled := v_has_store_feature;
  new.is_paused_due_to_plan := not v_has_store_feature;
  return new;
end;
$$;

create or replace function public.notify_partner_store_paused_due_to_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.is_paused_due_to_plan = true
     and coalesce(old.is_paused_due_to_plan, false) = false then
    insert into public.notifications (
      user_id,
      type,
      title,
      content,
      link
    )
    values (
      new.user_id,
      'plan_alert',
      'Sua Loja Parceira foi pausada',
      'Seu plano com recurso de loja expirou. A página pública e o selo premium foram pausados, mas todos os dados da sua loja continuam salvos para reativação após a renovação.',
      '/minha-conta/minha-loja'
    );
  end if;

  return new;
end;
$$;

drop policy if exists "seller_stores_public_read_active" on public.seller_stores;
create policy "seller_stores_public_read_active"
on public.seller_stores
for select
using (
  is_active = true
  and is_store_feature_enabled = true
  and coalesce(is_paused_due_to_plan, false) = false
);

drop trigger if exists trg_seller_stores_notify_paused_due_to_plan on public.seller_stores;
create trigger trg_seller_stores_notify_paused_due_to_plan
after update on public.seller_stores
for each row
execute function public.notify_partner_store_paused_due_to_plan();

do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select user_id from public.seller_stores
  loop
    perform public.sync_seller_store_feature_status(v_user_id);
  end loop;
end $$;
