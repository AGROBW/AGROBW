alter table public.growth_conversion_settings
  add column if not exists templates jsonb not null default '{
    "high_views": {
      "subject": "Seu anuncio esta ganhando tracao na AGRO BW",
      "title": "Oportunidade AGRO BW: anuncio com boa tracao",
      "message": "Seu anuncio \"{titulo_anuncio}\" ja acumulou {visualizacoes} visualizacoes. Destaca-lo agora pode ajudar a transformar audiencia em contatos.",
      "supportText": "Seu plano atual pode estar limitando a exposicao maxima desse resultado. Avalie um upgrade para aproveitar melhor o momento.",
      "cta": "Ver planos e impulsionar",
      "link": "/minha-conta/meu-plano?source=growth"
    },
    "top_category": {
      "subject": "Seu anuncio esta em evidencia na categoria",
      "title": "Oportunidade AGRO BW: anuncio em evidencia na categoria",
      "message": "Seu anuncio \"{titulo_anuncio}\" esta entre os mais vistos da categoria. Um destaque pode acelerar contatos e ampliar a exposicao.",
      "supportText": "Aparecer entre os primeiros do ranking e um bom sinal para reforcar sua estrategia comercial agora.",
      "cta": "Comprar destaque",
      "link": "/minha-conta/meu-plano?source=growth"
    },
    "no_leads": {
      "subject": "Seu anuncio esta atraindo publico, mas ainda sem conversao",
      "title": "Oportunidade AGRO BW: alta audiencia sem conversao",
      "message": "Seu anuncio \"{titulo_anuncio}\" ja acumulou {visualizacoes} visualizacoes e ainda nao recebeu contatos. Um plano com destaque pode aumentar suas chances de conversao.",
      "supportText": "Ajustar seu plano neste momento pode ajudar a transformar interesse em oportunidade comercial concreta.",
      "cta": "Ver planos com mais alcance",
      "link": "/minha-conta/meu-plano?source=growth"
    },
    "expiring": {
      "subject": "Seu anuncio esta perto do vencimento",
      "title": "Oportunidade AGRO BW: anuncio perto do vencimento",
      "message": "Seu anuncio \"{titulo_anuncio}\" expira em {dias_restantes} dia(s) e ja chamou atencao de compradores. Aproveite o momento para reforcar a exposicao.",
      "supportText": "Se o anuncio perder ritmo agora, voce pode desperdicar um bom momento de interesse do mercado.",
      "cta": "Renovar estrategia do anuncio",
      "link": "/minha-conta/meu-plano?source=growth"
    },
    "plan_limit": {
      "subject": "Seu plano atual esta limitando seu potencial de exposicao",
      "title": "Oportunidade AGRO BW: seu plano limita a exposicao",
      "message": "Seu anuncio \"{titulo_anuncio}\" ja esta gerando interesse, mas o plano atual nao libera {tipo_recurso}. Fazer upgrade agora pode ampliar o alcance.",
      "supportText": "Voce ja tem sinais reais de interesse. O ajuste de plano pode destravar mais exposicao e acelerar conversoes.",
      "cta": "Fazer upgrade agora",
      "link": "/minha-conta/meu-plano?source=growth"
    }
  }'::jsonb;

alter table public.renewal_notification_settings
  add column if not exists templates jsonb not null default '{
    "seven_days": {
      "subject": "Seu plano expira em 7 dias",
      "title": "Renovacao AGRO BW: seu plano expira em 7 dias",
      "message": "Seu plano \"{nome_plano}\" expira em {dias_restantes} dias, em {data_vencimento}. Renove com antecedencia para manter anuncios, destaques e beneficios ativos sem interrupcao.",
      "supportText": "Organizar a renovacao agora ajuda a manter sua operacao e sua exposicao comercial sem pausa.",
      "cta": "Renovar com antecedencia",
      "link": "/minha-conta/meu-plano?source=renewal"
    },
    "three_days": {
      "subject": "Seu plano expira em 3 dias",
      "title": "Renovacao AGRO BW: seu plano expira em 3 dias",
      "message": "Seu plano \"{nome_plano}\" expira em {dias_restantes} dias, em {data_vencimento}. Vale revisar a renovacao agora para nao perder sua exposicao na plataforma.",
      "supportText": "Esse e um bom momento para confirmar a renovacao e evitar perda de ritmo nos seus anuncios.",
      "cta": "Revisar renovacao",
      "link": "/minha-conta/meu-plano?source=renewal"
    },
    "one_day": {
      "subject": "Seu plano vence amanha",
      "title": "Renovacao AGRO BW: seu plano expira amanha",
      "message": "Seu plano \"{nome_plano}\" vence amanha, em {data_vencimento}. Garanta a renovacao para continuar com acesso aos recursos pagos sem pausa.",
      "supportText": "Se voce renovar hoje, evita qualquer interrupcao nos beneficios e no acompanhamento dos seus resultados.",
      "cta": "Renovar hoje",
      "link": "/minha-conta/meu-plano?source=renewal"
    },
    "expiration_day": {
      "subject": "Seu plano vence hoje",
      "title": "Renovacao AGRO BW: seu plano vence hoje",
      "message": "Seu plano \"{nome_plano}\" vence hoje. Renove agora para nao interromper seus beneficios e a exposicao dos seus anuncios.",
      "supportText": "Uma renovacao ainda hoje ajuda a preservar continuidade operacional e acesso aos recursos do plano.",
      "cta": "Renovar agora",
      "link": "/minha-conta/meu-plano?source=renewal"
    },
    "expired": {
      "subject": "Seu plano expirou",
      "title": "Renovacao AGRO BW: seu plano expirou",
      "message": "Seu plano \"{nome_plano}\" ja expirou em {data_vencimento}. Reative a assinatura para recuperar recursos pagos, exposicao e continuidade operacional.",
      "supportText": "Enquanto o plano permanecer vencido, voce pode perder alcance, recursos premium e novas oportunidades de conversao.",
      "cta": "Reativar assinatura",
      "link": "/minha-conta/meu-plano?source=renewal"
    }
  }'::jsonb;

create or replace function public.replace_template_placeholders(
  p_template text,
  p_values jsonb
)
returns text
language plpgsql
immutable
as $$
declare
  v_result text := coalesce(p_template, '');
  v_key text;
  v_value text;
begin
  if p_values is null then
    return v_result;
  end if;

  for v_key, v_value in
    select key, value
    from jsonb_each_text(p_values)
  loop
    v_result := replace(v_result, '{' || v_key || '}', coalesce(v_value, ''));
  end loop;

  return v_result;
end;
$$;

create or replace function public.append_query_param(
  p_link text,
  p_key text,
  p_value text
)
returns text
language plpgsql
immutable
as $$
declare
  v_link text := coalesce(nullif(trim(p_link), ''), '/minha-conta/meu-plano');
begin
  if position((p_key || '=') in v_link) > 0 then
    return v_link;
  end if;

  if position('?' in v_link) > 0 then
    return v_link || '&' || p_key || '=' || p_value;
  end if;

  return v_link || '?' || p_key || '=' || p_value;
end;
$$;

create or replace function public.generate_growth_conversion_notification_for_user(
  p_user_id uuid default auth.uid()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.growth_conversion_settings%rowtype;
  v_plan record;
  v_notifications_today integer := 0;
  v_candidate record;
  v_template jsonb;
  v_title text;
  v_content_main text;
  v_content_support text;
  v_content text;
  v_subject text;
  v_cta text;
  v_link text;
  v_notification_id uuid;
  v_days_left integer;
  v_user_name text := 'Usuario';
  v_values jsonb;
begin
  if p_user_id is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Usuario nao autenticado'
    );
  end if;

  select *
  into v_settings
  from public.growth_conversion_settings
  limit 1;

  if not found then
    insert into public.growth_conversion_settings default values
    returning * into v_settings;
  end if;

  if not coalesce(v_settings.is_enabled, true) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'disabled'
    );
  end if;

  select coalesce(name, 'Usuario')
  into v_user_name
  from public.users
  where id = p_user_id;

  select
    p.name,
    coalesce(p.category_highlights_count, 0) as category_highlights_count,
    coalesce(p.home_highlight_count, 0) as home_highlight_count
  into v_plan
  from public.user_subscriptions us
  join public.plans p
    on p.id = us.plan_id
  where us.user_id = p_user_id
    and us.status = 'active'
    and us.current_period_end > now()
  order by us.current_period_end desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_active_plan'
    );
  end if;

  if not (
    lower(coalesce(v_plan.name, '')) in ('start', 'básico', 'basico')
    or (
      coalesce(v_plan.category_highlights_count, 0) = 0
      and coalesce(v_plan.home_highlight_count, 0) = 0
    )
  ) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'plan_not_eligible'
    );
  end if;

  select count(*)
  into v_notifications_today
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'plan_alert'
    and coalesce(n.link, '') like '%source=growth%'
    and n.created_at >= date_trunc('day', now());

  if v_notifications_today >= greatest(coalesce(v_settings.daily_user_limit, 1), 0) then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'daily_limit_reached'
    );
  end if;

  with chat_counts as (
    select
      c.announcement_id,
      count(*)::integer as chats_count
    from public.chats c
    where c.announcement_id is not null
    group by c.announcement_id
  ),
  lead_counts as (
    select
      l.announcement_id,
      count(*)::integer as leads_count
    from public.leads l
    where l.announcement_id is not null
    group by l.announcement_id
  ),
  all_active_ads as (
    select
      a.id,
      a.user_id,
      a.title,
      coalesce(a.views, 0) as views,
      a.created_at,
      a.expires_at,
      a.category_slug,
      coalesce(cc.chats_count, 0) as chats_count,
      coalesce(lc.leads_count, 0) as leads_count,
      dense_rank() over (
        partition by a.category_slug
        order by coalesce(a.views, 0) desc, a.created_at asc
      ) as category_rank
    from public.announcements a
    left join chat_counts cc
      on cc.announcement_id = a.id
    left join lead_counts lc
      on lc.announcement_id = a.id
    where upper(coalesce(a.status, '')) = 'ACTIVE'
      and (a.expires_at is null or a.expires_at > now())
  ),
  eligible as (
    select
      aa.*,
      case
        when coalesce(v_settings.trigger_no_leads_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_no_leads, 50)
          and aa.leads_count = 0
          and aa.chats_count = 0
          then 'no_leads'
        when coalesce(v_settings.trigger_top_category_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          and aa.category_rank <= 3
          then 'top_category'
        when coalesce(v_settings.trigger_expiring_enabled, true)
          and aa.expires_at is not null
          and aa.expires_at <= now() + make_interval(days => coalesce(v_settings.expire_soon_days, 7))
          and aa.views >= coalesce(v_settings.min_views_for_expiring, 15)
          then 'expiring'
        when coalesce(v_settings.trigger_plan_limit_enabled, true)
          and (aa.leads_count > 0 or aa.chats_count > 0)
          then 'plan_limit'
        when coalesce(v_settings.trigger_high_views_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          then 'high_views'
        else null
      end as trigger_kind,
      case
        when coalesce(v_settings.trigger_no_leads_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_no_leads, 50)
          and aa.leads_count = 0
          and aa.chats_count = 0
          then 1
        when coalesce(v_settings.trigger_top_category_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          and aa.category_rank <= 3
          then 2
        when coalesce(v_settings.trigger_expiring_enabled, true)
          and aa.expires_at is not null
          and aa.expires_at <= now() + make_interval(days => coalesce(v_settings.expire_soon_days, 7))
          and aa.views >= coalesce(v_settings.min_views_for_expiring, 15)
          then 3
        when coalesce(v_settings.trigger_plan_limit_enabled, true)
          and (aa.leads_count > 0 or aa.chats_count > 0)
          then 4
        when coalesce(v_settings.trigger_high_views_enabled, true)
          and aa.views >= coalesce(v_settings.min_views_for_high_views, 20)
          then 5
        else 99
      end as trigger_priority
    from all_active_ads aa
    where aa.user_id = p_user_id
  )
  select *
  into v_candidate
  from eligible
  where trigger_kind is not null
  order by trigger_priority asc, views desc, created_at desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_trigger_matched'
    );
  end if;

  if v_candidate.trigger_kind = 'expiring' then
    v_days_left := greatest(1, ceil(extract(epoch from (v_candidate.expires_at - now())) / 86400.0)::integer);
  else
    v_days_left := 0;
  end if;

  v_template := coalesce(v_settings.templates -> v_candidate.trigger_kind, '{}'::jsonb);

  v_values := jsonb_build_object(
    'nome_usuario', coalesce(v_user_name, 'Usuario'),
    'nome_plano', coalesce(v_plan.name, 'Seu plano'),
    'data_vencimento', coalesce(to_char(v_candidate.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), ''),
    'dias_restantes', v_days_left::text,
    'link_upgrade', '/minha-conta/meu-plano?source=growth',
    'titulo_anuncio', coalesce(v_candidate.title, 'Seu anuncio'),
    'visualizacoes', coalesce(v_candidate.views, 0)::text,
    'categoria_rank', coalesce(v_candidate.category_rank, 0)::text,
    'tipo_recurso', 'destaques Home/Categoria'
  );

  v_subject := public.replace_template_placeholders(coalesce(v_template ->> 'subject', ''), v_values);
  v_title := public.replace_template_placeholders(coalesce(v_template ->> 'title', ''), v_values);
  v_content_main := public.replace_template_placeholders(coalesce(v_template ->> 'message', ''), v_values);
  v_content_support := public.replace_template_placeholders(coalesce(v_template ->> 'supportText', ''), v_values);
  v_cta := public.replace_template_placeholders(coalesce(v_template ->> 'cta', ''), v_values);
  v_link := public.append_query_param(
    public.replace_template_placeholders(coalesce(v_template ->> 'link', '/minha-conta/meu-plano'), v_values),
    'source',
    'growth'
  );
  v_content := trim(
    both
    from concat(
      coalesce(v_content_main, ''),
      case
        when nullif(trim(coalesce(v_content_support, '')), '') is not null
          then E'\n\n' || v_content_support
        else ''
      end
    )
  );

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
    'subject', v_subject,
    'supportText', v_content_support,
    'cta', v_cta,
    'link', v_link,
    'trigger', v_candidate.trigger_kind
  );
end;
$$;

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
  v_template jsonb;
  v_title text;
  v_content_main text;
  v_content_support text;
  v_content text;
  v_subject text;
  v_cta text;
  v_link text;
  v_notification_id uuid;
  v_stage text;
  v_days_until_expiration integer;
  v_plan_name text;
  v_user_name text := 'Usuario';
  v_values jsonb;
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

  select coalesce(name, 'Usuario')
  into v_user_name
  from public.users
  where id = p_user_id;

  select count(*)
  into v_notifications_today
  from public.notifications n
  where n.user_id = p_user_id
    and n.type = 'plan_alert'
    and coalesce(n.link, '') like '%source=renewal%'
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
    elsif coalesce(v_settings.notify_three_days_before, true) and v_days_until_expiration = 3 then
      v_stage := 'three_days';
    elsif coalesce(v_settings.notify_one_day_before, true) and v_days_until_expiration = 1 then
      v_stage := 'one_day';
    elsif coalesce(v_settings.notify_on_expiration_day, true) and v_days_until_expiration = 0 then
      v_stage := 'expiration_day';
    end if;
  elsif coalesce(v_settings.notify_after_expiration, true) then
    if floor(extract(epoch from (now() - v_subscription.current_period_end)) / 86400.0)::integer >= coalesce(v_settings.days_after_expiration, 1) then
      v_stage := 'expired';
    end if;
  end if;

  if v_stage is null then
    return jsonb_build_object(
      'success', true,
      'created', false,
      'reason', 'no_stage_matched'
    );
  end if;

  v_template := coalesce(v_settings.templates -> v_stage, '{}'::jsonb);

  v_values := jsonb_build_object(
    'nome_usuario', coalesce(v_user_name, 'Usuario'),
    'nome_plano', coalesce(v_plan_name, 'Seu plano'),
    'data_vencimento', coalesce(to_char(v_subscription.current_period_end at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), ''),
    'dias_restantes', greatest(v_days_until_expiration, 0)::text,
    'link_upgrade', '/minha-conta/meu-plano?source=renewal',
    'titulo_anuncio', '',
    'visualizacoes', '0',
    'categoria_rank', '0',
    'tipo_recurso', 'recursos premium'
  );

  v_subject := public.replace_template_placeholders(coalesce(v_template ->> 'subject', ''), v_values);
  v_title := public.replace_template_placeholders(coalesce(v_template ->> 'title', ''), v_values);
  v_content_main := public.replace_template_placeholders(coalesce(v_template ->> 'message', ''), v_values);
  v_content_support := public.replace_template_placeholders(coalesce(v_template ->> 'supportText', ''), v_values);
  v_cta := public.replace_template_placeholders(coalesce(v_template ->> 'cta', ''), v_values);
  v_link := public.append_query_param(
    public.replace_template_placeholders(coalesce(v_template ->> 'link', '/minha-conta/meu-plano'), v_values),
    'source',
    'renewal'
  );
  v_content := trim(
    both
    from concat(
      coalesce(v_content_main, ''),
      case
        when nullif(trim(coalesce(v_content_support, '')), '') is not null
          then E'\n\n' || v_content_support
        else ''
      end
    )
  );

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
    'subject', v_subject,
    'supportText', v_content_support,
    'cta', v_cta,
    'link', v_link,
    'stage', v_stage,
    'planName', v_plan_name,
    'showToast', coalesce(v_settings.show_dashboard_toast, true)
  );
end;
$$;
