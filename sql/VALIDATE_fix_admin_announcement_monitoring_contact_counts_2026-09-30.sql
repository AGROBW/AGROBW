with function_checks as (
  select
    to_regprocedure('public.admin_list_announcements_monitoring()') is not null as rpc_criada,
    pg_get_function_result(to_regprocedure('public.admin_list_announcements_monitoring()')) ilike '%leads_count bigint%' as retorna_leads,
    pg_get_function_result(to_regprocedure('public.admin_list_announcements_monitoring()')) ilike '%messages_count bigint%' as retorna_conversas,
    pg_get_functiondef(to_regprocedure('public.admin_list_announcements_monitoring()')) ilike '%public.guest_announcement_contacts%' as inclui_visitantes,
    pg_get_functiondef(to_regprocedure('public.admin_list_announcements_monitoring()')) ilike '%public.leads%' as inclui_leads_cadastrados,
    pg_get_functiondef(to_regprocedure('public.admin_list_announcements_monitoring()')) ilike '%public.chats%' as inclui_conversas_cadastradas
),
index_checks as (
  select coalesce(bool_or(
    indexes.indexname = 'guest_announcement_contacts_announcement_idx'
    and indexes.indexdef ilike '%announcement_id%'
  ), false) as indice_contatos_visitantes
  from pg_indexes indexes
  where indexes.schemaname = 'public'
    and indexes.tablename = 'guest_announcement_contacts'
),
privilege_checks as (
  select
    has_function_privilege('authenticated', 'public.admin_list_announcements_monitoring()', 'EXECUTE') as autenticado_executa,
    not has_function_privilege('anon', 'public.admin_list_announcements_monitoring()', 'EXECUTE') as anon_sem_acesso
)
select
  function_checks.rpc_criada,
  function_checks.retorna_leads,
  function_checks.retorna_conversas,
  function_checks.inclui_visitantes,
  function_checks.inclui_leads_cadastrados,
  function_checks.inclui_conversas_cadastradas,
  index_checks.indice_contatos_visitantes,
  privilege_checks.autenticado_executa,
  privilege_checks.anon_sem_acesso
from function_checks
cross join index_checks
cross join privilege_checks;
