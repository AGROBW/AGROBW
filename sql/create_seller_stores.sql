create table if not exists public.seller_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  slug text not null unique,
  store_name text not null,
  description text,
  logo_url text,
  cover_url text,
  cover_position_x integer not null default 50,
  cover_position_y integer not null default 50,
  whatsapp text,
  email text,
  instagram_url text,
  website_url text,
  city text,
  state text,
  is_active boolean not null default true,
  is_store_feature_enabled boolean not null default false,
  is_paused_due_to_plan boolean not null default false,
  is_verified boolean not null default false,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

create index if not exists idx_seller_stores_slug on public.seller_stores(slug);
create index if not exists idx_seller_stores_user_id on public.seller_stores(user_id);
create index if not exists idx_seller_stores_active on public.seller_stores(is_active);
create index if not exists idx_seller_stores_feature_enabled on public.seller_stores(is_store_feature_enabled);
create index if not exists idx_seller_stores_paused_due_to_plan on public.seller_stores(is_paused_due_to_plan);

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

drop trigger if exists trg_seller_stores_initial_feature_sync on public.seller_stores;
create trigger trg_seller_stores_initial_feature_sync
before insert or update on public.seller_stores
for each row
execute function public.handle_seller_store_initial_feature_sync();

drop trigger if exists trg_seller_stores_updated_at on public.seller_stores;
create trigger trg_seller_stores_updated_at
before update on public.seller_stores
for each row
execute function public.update_updated_at_column();

alter table public.seller_stores enable row level security;

drop policy if exists "seller_stores_public_read_active" on public.seller_stores;
create policy "seller_stores_public_read_active"
on public.seller_stores
for select
using (is_active = true and is_store_feature_enabled = true and coalesce(is_paused_due_to_plan, false) = false);

drop trigger if exists trg_seller_stores_notify_paused_due_to_plan on public.seller_stores;
create trigger trg_seller_stores_notify_paused_due_to_plan
after update on public.seller_stores
for each row
execute function public.notify_partner_store_paused_due_to_plan();

drop policy if exists "seller_stores_owner_read" on public.seller_stores;
create policy "seller_stores_owner_read"
on public.seller_stores
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "seller_stores_owner_insert" on public.seller_stores;
create policy "seller_stores_owner_insert"
on public.seller_stores
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "seller_stores_owner_update" on public.seller_stores;
create policy "seller_stores_owner_update"
on public.seller_stores
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "seller_stores_owner_delete" on public.seller_stores;
create policy "seller_stores_owner_delete"
on public.seller_stores
for delete
to authenticated
using (auth.uid() = user_id);

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
