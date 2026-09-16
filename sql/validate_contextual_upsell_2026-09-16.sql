-- Deve retornar uma linha contendo apenas true.
select
  to_regclass('public.contextual_upsell_settings') is not null as configuracao_criada,
  to_regclass('public.contextual_upsell_events') is not null as eventos_criados,
  to_regclass('public.contextual_upsell_recovery_queue') is not null as fila_criada,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.contextual_upsell_settings'::regclass) as configuracao_rls_forcada,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.contextual_upsell_events'::regclass) as eventos_rls_forcada,
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.contextual_upsell_recovery_queue'::regclass) as fila_rls_forcada,
  not has_table_privilege('anon', 'public.contextual_upsell_settings', 'select') as anon_sem_configuracao,
  not has_table_privilege('authenticated', 'public.contextual_upsell_events', 'select') as autenticado_sem_eventos_diretos,
  not has_table_privilege('authenticated', 'public.contextual_upsell_recovery_queue', 'select') as autenticado_sem_fila,
  has_function_privilege('authenticated', 'public.get_my_contextual_upsell_runtime()', 'execute') as autenticado_le_runtime,
  has_function_privilege('authenticated', 'public.record_my_contextual_upsell_event(text,text,text,uuid,text,uuid,text)', 'execute') as autenticado_grava_evento,
  not has_function_privilege('anon', 'public.get_my_contextual_upsell_runtime()', 'execute') as anon_sem_runtime,
  not has_function_privilege('anon', 'public.record_my_contextual_upsell_event(text,text,text,uuid,text,uuid,text)', 'execute') as anon_sem_evento,
  not has_function_privilege('anon', 'public.attribute_contextual_upsell_conversion(uuid,uuid,text)', 'execute') as anon_sem_atribuicao,
  has_function_privilege('service_role', 'public.attribute_contextual_upsell_conversion(uuid,uuid,text)', 'execute') as worker_atribui_conversao,
  (select not is_enabled and not recovery_enabled and cardinality(enabled_contexts) = 0 from public.contextual_upsell_settings where id = '00000000-0000-0000-0000-000000000041'::uuid) as desativado_por_padrao,
  to_regprocedure('public.attribute_contextual_upsell_conversion(uuid,uuid,text)') is not null as atribuicao_criada,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contextual_upsell_events'
      and column_name = 'source_event_id'
  ) as origem_checkout_criada,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contextual_upsell_events'
      and column_name = 'conversion_key'
  ) as chave_conversao_criada,
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'contextual_upsell_recovery_queue'
      and column_name in ('email', 'phone', 'message', 'recipient')
  ) as fila_sem_contato;
