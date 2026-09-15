with relations as (
  select
    c.relname,
    c.relrowsecurity,
    c.relforcerowsecurity
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'whatsapp_gateway_templates',
      'whatsapp_gateway_jobs',
      'whatsapp_gateway_enqueue_failures'
    )
), triggers as (
  select count(*)::integer as total
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
    and t.tgname in (
      'trg_queue_whatsapp_admin_announcement',
      'trg_queue_whatsapp_admin_edit_request',
      'trg_queue_whatsapp_admin_support_message',
      'trg_queue_whatsapp_admin_store_campaign'
    )
)
select
  to_regclass('public.whatsapp_gateway_templates') is not null as templates_criados,
  to_regclass('public.whatsapp_gateway_jobs') is not null as fila_criada,
  to_regclass('public.whatsapp_gateway_enqueue_failures') is not null as diagnostico_criado,
  (select count(*) = 3 and bool_and(relrowsecurity and relforcerowsecurity) from relations) as rls_forcada,
  (
    select count(*) = 5
    from public.whatsapp_gateway_templates
    where event_type in (
      'admin_announcement_pending',
      'admin_edit_request_pending',
      'admin_announcement_reported',
      'admin_support_message',
      'admin_store_campaign_pending'
    )
  ) as cinco_eventos_criados,
  (select total = 4 from triggers) as gatilhos_criados,
  not has_table_privilege('anon', 'public.whatsapp_gateway_templates', 'SELECT') as anon_sem_templates,
  not has_table_privilege('authenticated', 'public.whatsapp_gateway_jobs', 'SELECT') as autenticado_sem_fila,
  not has_table_privilege('authenticated', 'public.whatsapp_gateway_enqueue_failures', 'SELECT') as autenticado_sem_diagnostico,
  not has_sequence_privilege('anon', 'public.whatsapp_gateway_enqueue_failures_id_seq', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.whatsapp_gateway_enqueue_failures_id_seq', 'USAGE')
    as sequencia_diagnostico_privada,
  has_function_privilege('authenticated', 'public.get_whatsapp_gateway_templates_admin_safe()', 'EXECUTE') as autenticado_rpc_templates,
  not has_function_privilege('anon', 'public.get_whatsapp_gateway_templates_admin_safe()', 'EXECUTE') as anon_sem_rpc_templates,
  has_function_privilege('service_role', 'public.claim_whatsapp_gateway_jobs(integer,uuid)', 'EXECUTE') as worker_reserva_fila,
  has_function_privilege('service_role', 'public.release_whatsapp_gateway_jobs(uuid,uuid[])', 'EXECUTE') as worker_libera_fila,
  has_function_privilege('service_role', 'public.complete_whatsapp_gateway_job(uuid,uuid,integer,text)', 'EXECUTE') as worker_conclui_fila,
  has_function_privilege('service_role', 'public.fail_whatsapp_gateway_job(uuid,uuid,text,integer,boolean)', 'EXECUTE') as worker_reagenda_fila,
  to_regprocedure('public.try_enqueue_whatsapp_gateway_event(text,text,text,uuid,jsonb,text,text,uuid)') is not null as enfileiramento_isolado,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_gateway_templates'
      and column_name = 'allowed_placeholders'
  ) as placeholders_permitidos_criados,
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'whatsapp_gateway_jobs'
      and column_name in ('auth_secret', 'recipient_phone')
  ) as fila_sem_segredo_ou_telefone;
