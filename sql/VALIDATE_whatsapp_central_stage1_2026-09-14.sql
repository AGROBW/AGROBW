select
  to_regclass('public.whatsapp_gateway_settings') is not null as tabela_criada,
  to_regprocedure('public.get_whatsapp_gateway_settings_admin_safe()') is not null as leitura_criada,
  to_regprocedure('public.update_whatsapp_gateway_settings_admin_safe(text,text,text,text,text,text,boolean)') is not null as escrita_criada,
  coalesce((
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = to_regclass('public.whatsapp_gateway_settings')
  ), false) as rls_forcada,
  not has_table_privilege('anon', 'public.whatsapp_gateway_settings', 'SELECT') as anon_sem_leitura,
  not has_table_privilege('authenticated', 'public.whatsapp_gateway_settings', 'SELECT') as autenticado_sem_leitura_direta,
  has_function_privilege('authenticated', 'public.get_whatsapp_gateway_settings_admin_safe()', 'EXECUTE') as autenticado_rpc_leitura,
  has_function_privilege(
    'authenticated',
    'public.update_whatsapp_gateway_settings_admin_safe(text,text,text,text,text,text,boolean)',
    'EXECUTE'
  ) as autenticado_rpc_escrita,
  not has_function_privilege('anon', 'public.get_whatsapp_gateway_settings_admin_safe()', 'EXECUTE') as anon_sem_rpc,
  not exists (
    select 1
    from information_schema.parameters parameters
    join information_schema.routines routines
      on routines.specific_catalog = parameters.specific_catalog
     and routines.specific_schema = parameters.specific_schema
     and routines.specific_name = parameters.specific_name
    where routines.routine_schema = 'public'
      and routines.routine_name = 'get_whatsapp_gateway_settings_admin_safe'
      and parameters.parameter_mode in ('OUT', 'INOUT')
      and parameters.parameter_name = 'auth_secret'
  ) as segredo_nao_exposto,
  coalesce((
    select not is_enabled
    from public.whatsapp_gateway_settings
    where id = '00000000-0000-0000-0000-000000000020'
  ), false) as desativada_por_padrao,
  public.is_safe_whatsapp_gateway_base_url('https://whatsapp-api.example.com') as https_publico_aceito,
  not public.is_safe_whatsapp_gateway_base_url('http://whatsapp-api.example.com') as http_recusado,
  not public.is_safe_whatsapp_gateway_base_url('https://192.168.1.10:3333') as ip_privado_recusado,
  not public.is_safe_whatsapp_gateway_base_url('https://203.0.113.10') as ip_literal_recusado,
  not public.is_safe_whatsapp_gateway_base_url('https://whatsapp-api.example.com:99999') as porta_invalida_recusada;
