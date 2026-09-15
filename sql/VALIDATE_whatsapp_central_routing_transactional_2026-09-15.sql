begin;

create temporary table whatsapp_central_routing_validation (
  central_ativa_um_job_novo boolean not null,
  central_ativa_zero_jobs_legados boolean not null,
  central_inativa_zero_jobs_novos boolean not null,
  central_inativa_um_job_legado boolean not null,
  detalhes text not null
) on commit drop;

do $$
declare
  v_sample jsonb;
  v_active_lead_id uuid := gen_random_uuid();
  v_fallback_lead_id uuid := gen_random_uuid();
  v_validation_chat_id uuid;
  v_lead_columns text;
  v_lead_selectors text;
  v_central_active_count integer;
  v_legacy_active_count integer;
  v_central_fallback_count integer;
  v_legacy_fallback_count integer;
begin
  if to_regclass('public.whatsapp_notification_jobs') is null then
    raise exception 'VALIDACAO REPROVADA: fila legada whatsapp_notification_jobs nao encontrada';
  end if;

  select to_jsonb(leads.*) into v_sample
  from public.leads
  order by created_at desc
  limit 1;
  if not found then
    raise exception 'VALIDACAO REPROVADA: crie ao menos um lead de teste no staging antes de executar este validador';
  end if;

  select case
    when attributes.attnotnull then nullif(v_sample->>'chat_id', '')::uuid
    else null
  end into v_validation_chat_id
  from pg_attribute attributes
  where attributes.attrelid = 'public.leads'::regclass
    and attributes.attname = 'chat_id'
    and not attributes.attisdropped;

  select
    string_agg(format('%I', attributes.attname), ', ' order by attributes.attnum),
    string_agg(format('source_row.%I', attributes.attname), ', ' order by attributes.attnum)
  into v_lead_columns, v_lead_selectors
  from pg_attribute attributes
  where attributes.attrelid = 'public.leads'::regclass
    and attributes.attnum > 0
    and not attributes.attisdropped
    and attributes.attgenerated = ''
    and attributes.attidentity <> 'a';

  update public.whatsapp_gateway_settings
  set
    base_url = 'https://gateway-validation.example.com',
    auth_secret = 'validation-only-secret',
    default_recipient_phone = '5564999999999',
    is_enabled = true
  where id = '00000000-0000-0000-0000-000000000020';
  update public.whatsapp_gateway_templates set is_enabled = true where event_type = 'seller_new_lead';

  execute format(
    'insert into public.leads (%s) select %s from jsonb_populate_record(null::public.leads, $1) source_row',
    v_lead_columns,
    v_lead_selectors
  ) using v_sample || jsonb_build_object(
    'id', v_active_lead_id,
    'chat_id', v_validation_chat_id,
    'buyer_name', 'Validacao Central',
    'buyer_email', 'validacao-central@example.com',
    'initial_message', 'Validacao transacional',
    'status', 'new',
    'created_at', now(),
    'updated_at', now()
  );

  select count(*) into v_central_active_count
  from public.whatsapp_gateway_jobs
  where event_type = 'seller_new_lead' and source_id = v_active_lead_id;
  select count(*) into v_legacy_active_count
  from public.whatsapp_notification_jobs
  where lead_id = v_active_lead_id;

  delete from public.whatsapp_gateway_jobs where source_id = v_active_lead_id;
  delete from public.leads where id = v_active_lead_id;

  update public.whatsapp_gateway_settings
  set is_enabled = false
  where id = '00000000-0000-0000-0000-000000000020';

  execute format(
    'insert into public.leads (%s) select %s from jsonb_populate_record(null::public.leads, $1) source_row',
    v_lead_columns,
    v_lead_selectors
  ) using v_sample || jsonb_build_object(
    'id', v_fallback_lead_id,
    'chat_id', v_validation_chat_id,
    'buyer_name', 'Validacao Fallback',
    'buyer_email', 'validacao-fallback@example.com',
    'initial_message', 'Validacao transacional',
    'status', 'new',
    'created_at', now(),
    'updated_at', now()
  );

  select count(*) into v_central_fallback_count
  from public.whatsapp_gateway_jobs
  where event_type = 'seller_new_lead' and source_id = v_fallback_lead_id;
  select count(*) into v_legacy_fallback_count
  from public.whatsapp_notification_jobs
  where lead_id = v_fallback_lead_id;

  insert into whatsapp_central_routing_validation values (
    v_central_active_count = 1,
    v_legacy_active_count = 0,
    v_central_fallback_count = 0,
    v_legacy_fallback_count = 1,
    format(
      'ativa: central=%s meta=%s; inativa: central=%s meta=%s',
      v_central_active_count,
      v_legacy_active_count,
      v_central_fallback_count,
      v_legacy_fallback_count
    )
  );

  if v_central_active_count <> 1
    or v_legacy_active_count <> 0
    or v_central_fallback_count <> 0
    or v_legacy_fallback_count <> 1 then
    raise exception 'VALIDACAO REPROVADA: ativa central=% meta=%; inativa central=% meta=%',
      v_central_active_count,
      v_legacy_active_count,
      v_central_fallback_count,
      v_legacy_fallback_count;
  end if;

  raise notice 'VALIDACAO APROVADA: Central ativa 1/0 e Central inativa 0/1. A transacao sera revertida.';
exception when others then
  if sqlerrm like 'VALIDACAO REPROVADA:%' then
    raise;
  end if;
  raise exception 'VALIDACAO REPROVADA: %', sqlerrm;
end;
$$;

select * from whatsapp_central_routing_validation;

rollback;
