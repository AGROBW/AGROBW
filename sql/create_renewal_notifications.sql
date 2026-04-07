create table if not exists public.renewal_notification_settings (
  id uuid primary key default gen_random_uuid(),
  is_enabled boolean not null default true,
  daily_user_limit integer not null default 1,
  notify_seven_days_before boolean not null default true,
  notify_three_days_before boolean not null default true,
  notify_one_day_before boolean not null default true,
  notify_on_expiration_day boolean not null default true,
  notify_after_expiration boolean not null default true,
  days_after_expiration integer not null default 1,
  show_dashboard_toast boolean not null default true,
  updated_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_notification_settings_daily_limit_check check (daily_user_limit >= 0),
  constraint renewal_notification_settings_days_after_expiration_check check (days_after_expiration >= 1)
);

create unique index if not exists renewal_notification_settings_singleton_idx
  on public.renewal_notification_settings ((true));

insert into public.renewal_notification_settings (
  is_enabled,
  daily_user_limit,
  notify_seven_days_before,
  notify_three_days_before,
  notify_one_day_before,
  notify_on_expiration_day,
  notify_after_expiration,
  days_after_expiration,
  show_dashboard_toast
)
select
  true,
  1,
  true,
  true,
  true,
  true,
  true,
  1,
  true
where not exists (
  select 1
  from public.renewal_notification_settings
);

alter table public.renewal_notification_settings enable row level security;

drop policy if exists "Admins can manage renewal notification settings" on public.renewal_notification_settings;
create policy "Admins can manage renewal notification settings"
on public.renewal_notification_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.id = auth.uid()
      and users.is_admin = true
  )
);

create or replace function public.generate_renewal_notification_for_user(
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.renewal_notification_settings%rowtype;
  v_subscription record;
  v_notifications_today integer := 0;
  v_title text;
  v_content text;
  v_link text := '/minha-conta/meu-plano?source=renewal';
  v_notification_id uuid;
  v_stage text;
  v_days_until_expiration integer;
  v_plan_name text;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select *
  into v_settings
  from public.renewal_notification_settings
  limit 1;

  if not found then
    insert into public.renewal_notification_settings default values
    returning * into v_settings;
  end if;

  if not coalesce(v_settings.is_enabled, true) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'disabled'
    );
  end if;

  select count(*)
  into v_notifications_today
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'plan_alert'
    and n.title like 'Renovacao AGRO BW:%'
    and n.created_at >= date_trunc('day', now());

  if v_notifications_today >= greatest(coalesce(v_settings.daily_user_limit, 1), 0) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'daily_limit_reached'
    );
  end if;

  select
    us.id,
    us.current_period_end,
    us.status,
    p.name as plan_name
  into v_subscription
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where us.user_id = p_user_id
    and lower(coalesce(p.name, '')) not in ('start', 'básico', 'basico')
  order by
    case when us.status = 'active' then 0 else 1 end,
    us.current_period_end desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_paid_plan_found'
    );
  end if;

  v_plan_name := coalesce(v_subscription.plan_name, 'seu plano');

  if v_subscription.current_period_end is null then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'missing_current_period_end'
    );
  end if;

  v_days_until_expiration := floor(extract(epoch from (v_subscription.current_period_end - now())) / 86400.0)::integer;

  if v_subscription.current_period_end > now() then
    if coalesce(v_settings.notify_seven_days_before, true) and v_days_until_expiration = 7 then
      v_stage := 'seven_days';
      v_title := 'Renovacao AGRO BW: seu plano expira em 7 dias';
      v_content := format(
        'Seu plano "%s" expira em 7 dias. Renove com antecedencia para manter anuncios, destaques e beneficios ativos sem interrupcao.',
        v_plan_name
      );
    elsif coalesce(v_settings.notify_three_days_before, true) and v_days_until_expiration = 3 then
      v_stage := 'three_days';
      v_title := 'Renovacao AGRO BW: seu plano expira em 3 dias';
      v_content := format(
        'Seu plano "%s" expira em 3 dias. Vale revisar a renovacao agora para nao perder sua exposicao na plataforma.',
        v_plan_name
      );
    elsif coalesce(v_settings.notify_one_day_before, true) and v_days_until_expiration = 1 then
      v_stage := 'one_day';
      v_title := 'Renovacao AGRO BW: seu plano expira amanha';
      v_content := format(
        'Seu plano "%s" vence amanha. Garanta a renovacao para continuar com acesso aos recursos pagos sem pausa.',
        v_plan_name
      );
    elsif coalesce(v_settings.notify_on_expiration_day, true) and v_days_until_expiration = 0 then
      v_stage := 'expiration_day';
      v_title := 'Renovacao AGRO BW: seu plano vence hoje';
      v_content := format(
        'Seu plano "%s" vence hoje. Renove agora para nao interromper seus beneficios e a exposicao dos seus anuncios.',
        v_plan_name
      );
    end if;
  elsif coalesce(v_settings.notify_after_expiration, true) then
    if floor(extract(epoch from (now() - v_subscription.current_period_end)) / 86400.0)::integer >= coalesce(v_settings.days_after_expiration, 1) then
      v_stage := 'expired';
      v_title := 'Renovacao AGRO BW: seu plano expirou';
      v_content := format(
        'Seu plano "%s" ja expirou. Reative a assinatura para recuperar recursos pagos, exposicao e continuidade operacional.',
        v_plan_name
      );
    end if;
  end if;

  if v_stage is null then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_stage_matched'
    );
  end if;

  insert into public.notifications (
    user_id,
    type,
    title,
    content,
    link
  )
  values (
    p_user_id,
    'plan_alert',
    v_title,
    v_content,
    v_link
  )
  returning id into v_notification_id;

  return jsonb_build_object(
    'success', true,
    'created', true,
    'notification_id', v_notification_id,
    'title', v_title,
    'content', v_content,
    'link', v_link,
    'stage', v_stage,
    'planName', v_plan_name,
    'showToast', coalesce(v_settings.show_dashboard_toast, true)
  );
end;
$$;

grant execute on function public.generate_renewal_notification_for_user(uuid) to authenticated;

create or replace function public.generate_renewal_notifications_batch()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_result jsonb;
  v_created_count integer := 0;
begin
  for v_user_id in
    select distinct us.user_id
    from public.user_subscriptions us
    join public.plans p
      on p.id = us.plan_id
    where lower(coalesce(p.name, '')) not in ('start', 'básico', 'basico')
  loop
    v_result := public.generate_renewal_notification_for_user(v_user_id);

    if coalesce((v_result ->> 'created')::boolean, false) then
      v_created_count := v_created_count + 1;
    end if;
  end loop;

  return v_created_count;
end;
$$;

grant execute on function public.generate_renewal_notifications_batch() to authenticated;
