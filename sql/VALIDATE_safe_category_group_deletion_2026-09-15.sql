select
  to_regprocedure('public.get_category_group_deletion_impact_admin(uuid)') is not null as previa_criada,
  to_regprocedure('public.delete_category_group_admin_safe(uuid,text)') is not null as exclusao_criada,
  coalesce((
    select prosecdef
    from pg_proc
    where oid = to_regprocedure('public.get_category_group_deletion_impact_admin(uuid)')
  ), false) as previa_security_definer,
  coalesce((
    select prosecdef
    from pg_proc
    where oid = to_regprocedure('public.delete_category_group_admin_safe(uuid,text)')
  ), false) as exclusao_security_definer,
  has_function_privilege(
    'authenticated',
    'public.get_category_group_deletion_impact_admin(uuid)',
    'EXECUTE'
  ) as autenticado_executa_previa,
  has_function_privilege(
    'authenticated',
    'public.delete_category_group_admin_safe(uuid,text)',
    'EXECUTE'
  ) as autenticado_executa_exclusao,
  not has_function_privilege(
    'anon',
    'public.get_category_group_deletion_impact_admin(uuid)',
    'EXECUTE'
  ) as anon_sem_previa,
  not has_function_privilege(
    'anon',
    'public.delete_category_group_admin_safe(uuid,text)',
    'EXECUTE'
  ) as anon_sem_exclusao,
  coalesce((
    select proconfig @> array['search_path=pg_catalog, pg_temp']
    from pg_proc
    where oid = to_regprocedure('public.delete_category_group_admin_safe(uuid,text)')
  ), false) as search_path_protegido;
