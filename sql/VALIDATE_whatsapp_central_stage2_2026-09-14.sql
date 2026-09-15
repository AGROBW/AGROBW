select
  to_regclass('public.whatsapp_gateway_settings') is not null as configuracao_disponivel,
  to_regclass('public.admin_audit_logs') is not null as auditoria_disponivel,
  to_regprocedure('public.check_rate_limit(uuid,text,integer,integer)') is not null as rate_limit_disponivel,
  coalesce(
    has_function_privilege(
      'service_role',
      to_regprocedure('public.check_rate_limit(uuid,text,integer,integer)'),
      'EXECUTE'
    ),
    false
  ) as service_role_executa_rate_limit,
  coalesce(
    has_table_privilege('service_role', to_regclass('public.whatsapp_gateway_settings'), 'SELECT'),
    false
  ) as service_role_le_configuracao,
  coalesce(
    has_table_privilege('service_role', to_regclass('public.admin_audit_logs'), 'INSERT'),
    false
  ) as service_role_grava_auditoria,
  coalesce(
    has_table_privilege('service_role', to_regclass('public.admin_audit_logs'), 'UPDATE'),
    false
  ) as service_role_atualiza_auditoria;
