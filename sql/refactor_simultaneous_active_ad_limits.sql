create or replace function public.enforce_simultaneous_active_ad_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_subscription record;
  current_active_ads integer := 0;
begin
  if coalesce(new.status, '') not in ('ACTIVE', 'active') then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.status, '') in ('ACTIVE', 'active') then
    return new;
  end if;

  if new.user_id is null then
    raise exception 'Usuario do anuncio nao informado';
  end if;

  select
    us.*,
    p.max_ads,
    p.name as plan_name
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = new.user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    raise exception 'Nao existe plano ativo para publicar este anuncio';
  end if;

  if active_subscription.max_ads is null then
    return new;
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = new.user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now())
    and (tg_op <> 'UPDATE' or a.id <> new.id);

  if current_active_ads >= active_subscription.max_ads then
    raise exception '%',
      format(
        'Voce atingiu o limite de anuncios ativos do plano %s. Desative outro anuncio ativo ou faca upgrade para liberar mais vagas.',
        coalesce(active_subscription.plan_name, 'atual')
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_simultaneous_active_ad_limit on public.announcements;

create trigger trg_enforce_simultaneous_active_ad_limit
before insert or update of status on public.announcements
for each row
execute function public.enforce_simultaneous_active_ad_limit();

create or replace function public.get_my_active_ad_capacity_status()
returns table (
  plan_name text,
  active_ads_count integer,
  max_ads integer,
  available_slots integer,
  is_over_limit boolean,
  can_publish_new boolean,
  can_reactivate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  active_subscription record;
  current_active_ads integer := 0;
  current_max_ads integer := 0;
begin
  if current_user_id is null then
    raise exception 'Usuario nao autenticado';
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = current_user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now());

  select
    p.name,
    p.max_ads
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = current_user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    plan_name := null;
    active_ads_count := current_active_ads;
    max_ads := 0;
    available_slots := 0;
    is_over_limit := current_active_ads > 0;
    can_publish_new := false;
    can_reactivate := false;
    return next;
    return;
  end if;

  current_max_ads := coalesce(active_subscription.max_ads, 0);

  plan_name := active_subscription.name;
  active_ads_count := current_active_ads;
  max_ads := current_max_ads;
  available_slots := greatest(current_max_ads - current_active_ads, 0);
  is_over_limit := current_active_ads > current_max_ads;
  can_publish_new := active_subscription.max_ads is null or current_active_ads < current_max_ads;
  can_reactivate := can_publish_new;

  return next;
end;
$$;

grant execute on function public.get_my_active_ad_capacity_status() to authenticated;

create or replace function public.reactivate_expired_announcement(p_announcement_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_announcement record;
  active_subscription record;
  current_active_ads integer := 0;
begin
  if current_user_id is null then
    return jsonb_build_object('success', false, 'error', 'Usuario nao autenticado');
  end if;

  select *
    into target_announcement
  from public.announcements
  where id = p_announcement_id
    and user_id = current_user_id
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Anuncio nao encontrado');
  end if;

  if target_announcement.status <> 'EXPIRED' then
    return jsonb_build_object('success', false, 'error', 'Apenas anuncios vencidos podem ser reativados');
  end if;

  select
    us.*,
    p.max_ads,
    p.name as plan_name
    into active_subscription
  from public.user_subscriptions us
  join public.plans p on p.id = us.plan_id
  where us.user_id = current_user_id
    and us.status = 'active'
    and us.current_period_end >= now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Nao existe assinatura ativa para reativar este anuncio');
  end if;

  select count(*)
    into current_active_ads
  from public.announcements a
  where a.user_id = current_user_id
    and a.status in ('ACTIVE', 'active')
    and (a.expires_at is null or a.expires_at > now());

  if active_subscription.max_ads is not null and current_active_ads >= active_subscription.max_ads then
    return jsonb_build_object(
      'success', false,
      'error', 'Nao ha espaco disponivel no seu plano atual para reativar este anuncio. Desative outro anuncio ativo ou faca upgrade para liberar mais vagas.'
    );
  end if;

  update public.announcements
  set
    status = 'ACTIVE',
    updated_at = now(),
    expires_at = public.calculate_announcement_expires_at(current_user_id, now()),
    expired_at = null,
    deletion_scheduled_at = null,
    pre_expiration_notified_at = null,
    expiration_notified_at = null,
    highlight_category = false,
    highlight_category_until = null,
    highlight_home = false,
    highlight_home_until = null
  where id = p_announcement_id;

  insert into public.notifications (user_id, type, title, content, link)
  values (
    current_user_id,
    'SYSTEM',
    'Anuncio reativado',
    'Seu anuncio voltou a ficar ativo com sucesso e agora ocupa uma vaga do seu plano atual.',
    '/#/minha-conta/anuncios'
  );

  return jsonb_build_object('success', true, 'message', 'Anuncio reativado com sucesso');
end;
$$;

grant execute on function public.reactivate_expired_announcement(uuid) to authenticated;
