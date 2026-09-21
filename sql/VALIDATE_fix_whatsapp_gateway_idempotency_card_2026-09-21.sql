with job_columns as (
  select
    bool_or(column_name = 'idempotency_key' and data_type = 'uuid' and is_nullable = 'NO') as idempotency_key_criada,
    bool_or(column_name = 'event_cycle' and data_type = 'bigint') as ciclo_criado,
    bool_or(
      column_name = 'idempotency_contract_version'
      and data_type = 'text'
      and is_nullable = 'NO'
    ) as contrato_idempotencia_criado
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'whatsapp_gateway_jobs'
),
indexes as (
  select
    bool_or(indexname = 'idx_whatsapp_gateway_jobs_idempotency_key' and indexdef ilike '%unique%') as chave_unica,
    bool_or(indexname = 'idx_whatsapp_gateway_jobs_moderation_cycle_unique' and indexdef ilike '%unique%') as ciclo_unico
  from pg_indexes
  where schemaname = 'public'
),
state_security as (
  select coalesce(relrowsecurity and relforcerowsecurity, false) as estado_rls_forcada
  from pg_class
  where oid = to_regclass('public.whatsapp_announcement_moderation_state')
),
triggers as (
  select
    bool_or(
      tgname = 'trg_queue_whatsapp_admin_announcement'
      and not tgisinternal
      and tgtype = 21
      and tgattr::text = ''
    ) as gatilho_fila_after_sem_colunas,
    not bool_or(tgname = 'trg_track_whatsapp_announcement_moderation_cycle' and not tgisinternal)
      as sem_gatilho_before_de_ciclo,
    bool_or(tgname = 'trg_prepare_whatsapp_gateway_job_contract' and not tgisinternal) as gatilho_contrato
  from pg_trigger
  where tgrelid in (
    to_regclass('public.announcements'),
    to_regclass('public.whatsapp_gateway_jobs')
  )
),
duplicate_keys as (
  select count(*) as total
  from (
    select idempotency_key
    from public.whatsapp_gateway_jobs
    group by idempotency_key
    having count(*) > 1
  ) duplicated
),
legacy_retry_keys as (
  select count(*) as total
  from public.whatsapp_gateway_jobs
  where idempotency_contract_version = 'legacy-job-id-2026-09-21'
    and idempotency_key is distinct from id
),
duplicate_pending as (
  select count(*) as total
  from (
    select event_type, source_id, event_cycle, recipient_kind,
      coalesce(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    from public.whatsapp_gateway_jobs
    where event_type = 'admin_announcement_pending'
      and status in ('pending', 'processing', 'retry')
    group by event_type, source_id, event_cycle, recipient_kind,
      coalesce(recipient_user_id, '00000000-0000-0000-0000-000000000000'::uuid)
    having count(*) > 1
  ) duplicated
),
unnormalized_pending as (
  select count(*) as total
  from public.whatsapp_gateway_jobs jobs
  join public.whatsapp_announcement_moderation_state state
    on state.announcement_id = jobs.source_id
  where jobs.event_type = 'admin_announcement_pending'
    and jobs.status in ('pending', 'processing', 'retry')
    and state.in_moderation
    and jobs.idempotency_contract_version = 'legacy-job-id-2026-09-21'
    and jobs.event_cycle is null
    and (
      jobs.event_cycle is distinct from state.moderation_cycle
      or jobs.event_key is distinct from (
        jobs.source_id::text || ':moderation:' || state.moderation_cycle::text || ':'
        || jobs.recipient_kind || ':' || coalesce(jobs.recipient_user_id::text, 'default')
      )
    )
),
function_contract as (
  select
    pg_get_functiondef('public.prepare_whatsapp_gateway_job_contract()'::regprocedure)
      ilike '%https://agrobw.com.br/minha-conta/mensagens?chat=%' as dominio_canonico,
    pg_get_functiondef('public.prepare_whatsapp_gateway_job_contract()'::regprocedure)
      ilike '%ads-images%' as imagem_oficial,
    pg_get_functiondef('public.prepare_whatsapp_gateway_job_contract()'::regprocedure)
      ilike '%gateway_contract_version%' as contrato_cartao_persistido,
    pg_get_functiondef('public.queue_whatsapp_admin_announcement_event()'::regprocedure)
      ilike '%not v_old_in_moderation%' as ciclo_por_transicao
)
select
  coalesce(job_columns.idempotency_key_criada, false) as idempotency_key_criada,
  coalesce(job_columns.ciclo_criado, false) as ciclo_criado,
  coalesce(job_columns.contrato_idempotencia_criado, false) as contrato_idempotencia_criado,
  coalesce(indexes.chave_unica, false) as chave_unica,
  coalesce(indexes.ciclo_unico, false) as ciclo_unico,
  to_regclass('public.whatsapp_announcement_moderation_state') is not null as estado_criado,
  coalesce(state_security.estado_rls_forcada, false) as estado_rls_forcada,
  coalesce(triggers.gatilho_fila_after_sem_colunas, false) as gatilho_fila_after_sem_colunas,
  coalesce(triggers.sem_gatilho_before_de_ciclo, false) as sem_gatilho_before_de_ciclo,
  coalesce(triggers.gatilho_contrato, false) as gatilho_contrato,
  duplicate_keys.total = 0 as sem_chaves_duplicadas,
  legacy_retry_keys.total = 0 as retries_antigos_preservam_job_id,
  duplicate_pending.total = 0 as sem_moderacoes_pendentes_duplicadas,
  unnormalized_pending.total = 0 as moderacoes_pendentes_normalizadas,
  function_contract.dominio_canonico,
  function_contract.imagem_oficial,
  function_contract.contrato_cartao_persistido,
  function_contract.ciclo_por_transicao
from job_columns
cross join indexes
cross join state_security
cross join triggers
cross join duplicate_keys
cross join legacy_retry_keys
cross join duplicate_pending
cross join unnormalized_pending
cross join function_contract;
