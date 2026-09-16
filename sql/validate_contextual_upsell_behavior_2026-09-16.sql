-- Validador transacional: qualquer falha interrompe a execucao e tudo e revertido.
-- Pre-requisito: ao menos um usuario e um plano publico ativo nao-downgrade.
-- Resultado esperado: Success. No rows returned.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $$
declare
  v_user_id uuid;
  v_target_plan_id uuid;
  v_first record;
  v_second record;
  v_checkout_one record;
  v_checkout_two record;
  v_checkout_three record;
  v_count bigint;
begin
  select users.id into v_user_id
  from public.users users
  order by users.created_at desc
  limit 1;

  if v_user_id is null then
    raise exception 'VALIDACAO: nenhum usuario disponivel';
  end if;

  select plans.id into v_target_plan_id
  from public.plans plans
  where plans.is_active
    and not plans.is_downgrade_plan
    and plans.show_in_public_pricing is true
  order by plans.monthly_price asc, plans.position asc
  limit 1;

  if v_target_plan_id is null then
    raise exception 'VALIDACAO: nenhum plano publico elegivel';
  end if;

  delete from public.contextual_upsell_recovery_queue where user_id = v_user_id;
  delete from public.contextual_upsell_events where user_id = v_user_id;

  update public.contextual_upsell_settings
  set is_enabled = false,
      recovery_enabled = true,
      enabled_contexts = array['ad_limit']::text[],
      canary_user_ids = array[v_user_id]::uuid[],
      impression_cooldown_hours = 72;

  perform set_config('request.jwt.claim.sub', v_user_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );

  select * into v_first from public.record_my_contextual_upsell_event(
    'ad_limit', 'impression', 'plan', v_target_plan_id, null, null, '/minha-conta/anuncios'
  );
  select * into v_second from public.record_my_contextual_upsell_event(
    'ad_limit', 'impression', 'plan', v_target_plan_id, null, null, '/minha-conta/anuncios'
  );

  if not v_first.accepted or v_second.accepted or v_second.reason <> 'cooldown' then
    raise exception 'VALIDACAO: cooldown sequencial falhou';
  end if;

  select * into v_checkout_one from public.record_my_contextual_upsell_event(
    'ad_limit', 'checkout_started', 'plan', v_target_plan_id, null, null, '/minha-conta/financeiro'
  );
  select * into v_checkout_two from public.record_my_contextual_upsell_event(
    'ad_limit', 'checkout_started', 'plan', v_target_plan_id, null, null, '/minha-conta/financeiro'
  );

  if not v_checkout_one.accepted or not v_checkout_two.accepted then
    raise exception 'VALIDACAO: checkout nao foi aceito';
  end if;

  select count(*) into v_count
  from public.contextual_upsell_recovery_queue
  where user_id = v_user_id and status = 'pending';
  if v_count <> 1 then
    raise exception 'VALIDACAO: fila pendente duplicada (% registros)', v_count;
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'service_role', 'aal', 'aal2')::text,
    true
  );
  perform public.attribute_contextual_upsell_conversion(
    v_user_id, v_target_plan_id, 'checkout-validation-1'
  );

  select count(*) into v_count
  from public.contextual_upsell_events
  where user_id = v_user_id and target_plan_id = v_target_plan_id and event_type = 'converted';
  if v_count <> 1 then
    raise exception 'VALIDACAO: conversao nao foi atribuida (% registros)', v_count;
  end if;

  select count(*) into v_count
  from public.contextual_upsell_recovery_queue
  where user_id = v_user_id and target_plan_id = v_target_plan_id and status = 'converted';
  if v_count <> 1 then
    raise exception 'VALIDACAO: fila nao foi convertida';
  end if;

  perform public.attribute_contextual_upsell_conversion(
    v_user_id, v_target_plan_id, 'checkout-validation-1'
  );

  select count(*) into v_count
  from public.contextual_upsell_events
  where user_id = v_user_id and target_plan_id = v_target_plan_id and event_type = 'converted';
  if v_count <> 1 then
    raise exception 'VALIDACAO: conversao duplicada';
  end if;

  perform public.attribute_contextual_upsell_conversion(
    v_user_id, v_target_plan_id, 'checkout-validation-same-source'
  );

  select count(*) into v_count
  from public.contextual_upsell_events
  where user_id = v_user_id and target_plan_id = v_target_plan_id and event_type = 'converted';
  if v_count <> 1 then
    raise exception 'VALIDACAO: mesma compra com outra chave duplicou conversao';
  end if;

  -- Cada chamada do PostgREST usa uma transacao propria. Diferencie os
  -- checkouts anteriores para reproduzir esse comportamento nesta transacao.
  update public.contextual_upsell_events
  set created_at = created_at - interval '1 minute'
  where id in (v_checkout_one.event_id, v_checkout_two.event_id);

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
  select * into v_checkout_three from public.record_my_contextual_upsell_event(
    'ad_limit', 'checkout_started', 'plan', v_target_plan_id, null, null, '/minha-conta/financeiro'
  );
  if not v_checkout_three.accepted then
    raise exception 'VALIDACAO: recompra nao iniciou checkout';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_user_id, 'role', 'service_role', 'aal', 'aal2')::text,
    true
  );
  perform public.attribute_contextual_upsell_conversion(
    v_user_id, v_target_plan_id, 'checkout-validation-2'
  );

  select count(*) into v_count
  from public.contextual_upsell_events
  where user_id = v_user_id and target_plan_id = v_target_plan_id and event_type = 'converted';
  if v_count <> 2 then
    raise exception 'VALIDACAO: recompra nao gerou nova conversao';
  end if;
end;
$$;

set local role anon;
do $$
declare
  v_permission_denied boolean := false;
begin
  begin
    perform public.get_my_contextual_upsell_runtime();
  exception
    when insufficient_privilege then
      v_permission_denied := true;
  end;

  if not v_permission_denied then
    raise exception 'VALIDACAO: anon executou runtime';
  end if;
end;
$$;
reset role;

rollback;
