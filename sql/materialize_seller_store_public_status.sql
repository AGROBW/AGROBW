alter table public.seller_stores
  add column if not exists is_store_feature_enabled boolean not null default false;

create index if not exists idx_seller_stores_feature_enabled
  on public.seller_stores(is_store_feature_enabled);

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
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;
end;
$$;

create or replace function public.handle_seller_store_feature_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_seller_store_feature_status(coalesce(new.user_id, old.user_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_user_subscriptions_sync_seller_store_feature on public.user_subscriptions;
create trigger trg_user_subscriptions_sync_seller_store_feature
after insert or update or delete on public.user_subscriptions
for each row
execute function public.handle_seller_store_feature_sync();

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
  return new;
end;
$$;

drop trigger if exists trg_seller_stores_initial_feature_sync on public.seller_stores;
create trigger trg_seller_stores_initial_feature_sync
before insert or update on public.seller_stores
for each row
execute function public.handle_seller_store_initial_feature_sync();

drop policy if exists "seller_stores_public_read_active" on public.seller_stores;
create policy "seller_stores_public_read_active"
on public.seller_stores
for select
using (is_active = true and is_store_feature_enabled = true);

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
