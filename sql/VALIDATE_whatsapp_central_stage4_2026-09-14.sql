with expected_triggers(name) as (
  values
    ('trg_route_whatsapp_lead_notification'),
    ('trg_whatsapp_gateway_disabled_fallback'),
    ('trg_audit_whatsapp_gateway_settings'),
    ('trg_audit_whatsapp_gateway_templates'),
    ('trg_audit_whatsapp_gateway_job_retry')
), installed_triggers as (
  select t.tgname
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal
)
select
  (
    select count(*) = 2
    from public.whatsapp_gateway_templates
    where event_type in ('seller_new_lead', 'marketing_announcement_campaign')
  ) as templates_finais_criados,
  (
    select not is_enabled
    from public.whatsapp_gateway_templates
    where event_type = 'marketing_announcement_campaign'
  ) as campanha_desativada_por_padrao,
  exists (
    select 1
    from pg_catalog.pg_constraint constraints
    where constraints.conrelid = 'public.whatsapp_gateway_templates'::regclass
      and constraints.conname = 'whatsapp_gateway_templates_marketing_disabled'
  ) as campanha_bloqueada_no_banco,
  not exists (
    select 1 from expected_triggers expected
    where not exists (
      select 1 from installed_triggers installed where installed.tgname = expected.name
    )
  ) as gatilhos_finais_criados,
  not exists (
    select 1 from installed_triggers where tgname = 'on_lead_queue_whatsapp'
  ) as gatilho_legado_substituido,
  to_regprocedure('public.get_recent_whatsapp_gateway_jobs_admin_safe(integer)') is not null as historico_criado,
  to_regprocedure('public.retry_whatsapp_gateway_job_admin_safe(uuid)') is not null as reenvio_criado,
  to_regprocedure('public.release_whatsapp_gateway_jobs(uuid,uuid[])') is not null as liberacao_de_lote_criada,
  to_regprocedure('public.move_pending_whatsapp_seller_jobs_to_legacy()') is not null as fallback_pendente_criado,
  to_regprocedure('public.purge_terminal_whatsapp_gateway_jobs()') is not null as retencao_criada,
  has_function_privilege(
    'authenticated',
    'public.get_recent_whatsapp_gateway_jobs_admin_safe(integer)',
    'EXECUTE'
  ) as autenticado_rpc_historico,
  not has_function_privilege(
    'anon',
    'public.get_recent_whatsapp_gateway_jobs_admin_safe(integer)',
    'EXECUTE'
  ) as anon_sem_historico,
  not has_function_privilege(
    'anon',
    'public.retry_whatsapp_gateway_job_admin_safe(uuid)',
    'EXECUTE'
  ) as anon_sem_reenvio,
  has_function_privilege(
    'service_role',
    'public.release_whatsapp_gateway_jobs(uuid,uuid[])',
    'EXECUTE'
  ) as worker_libera_lote,
  has_function_privilege(
    'service_role',
    'public.purge_terminal_whatsapp_gateway_jobs()',
    'EXECUTE'
  ) as worker_aplica_retencao,
  pg_get_functiondef(to_regprocedure('public.get_recent_whatsapp_gateway_jobs_admin_safe(integer)'))
    not like '%message_body%' as historico_sem_mensagem,
  pg_get_functiondef(to_regprocedure('public.audit_whatsapp_gateway_admin_change()'))
    not like '%''auth_secret'', new.auth_secret%' as auditoria_sem_segredo;
