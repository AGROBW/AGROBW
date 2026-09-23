with readiness as (
  select
    to_regclass('public.seller_store_catalog_exports') is not null
      and to_regclass('public.seller_store_catalog_runtime_settings') is not null
      and to_regclass('public.seller_store_catalog_worker_runs') is not null as estrutura_completa,
    to_regprocedure('public.request_seller_store_catalog_export(uuid[],text,text,text)') is not null
      and to_regprocedure('public.request_seller_store_catalog_export_v2(uuid[],text,text,text,text)') is not null
      and to_regprocedure('public.claim_seller_store_catalog_exports(integer,uuid)') is not null
      and to_regprocedure('public.begin_seller_store_catalog_worker_run(uuid,integer)') is not null
      and to_regprocedure('public.finish_seller_store_catalog_worker_run(uuid,boolean,jsonb,text,integer)') is not null
      and to_regprocedure('public.get_seller_store_catalog_health_admin()') is not null
      and to_regprocedure('public.list_my_seller_store_catalog_exports(integer)') is not null
      and to_regprocedure('public.list_my_seller_store_catalog_exports_v2(integer)') is not null
      and to_regprocedure('public.get_seller_store_catalog_availability()') is not null
      and to_regprocedure('public.update_seller_store_catalog_runtime_admin(boolean,integer,integer)') is not null
      as contratos_completos,
    exists (
      select 1
      from storage.buckets buckets
      where buckets.id = 'seller-store-catalogs'
        and buckets.public = false
        and buckets.file_size_limit = 31457280
        and buckets.allowed_mime_types = array['application/pdf']::text[]
    ) as bucket_privado,
    not exists (
      select 1
      from pg_policies policies
      where policies.schemaname = 'storage'
        and policies.tablename = 'objects'
        and policies.policyname ilike 'seller_store_catalogs%'
    ) as bucket_sem_policy_browser,
    (
      select count(*) = 1
        and bool_and(settings.max_batch_size between 1 and 2)
        and bool_and(settings.failure_threshold between 2 and 10)
      from public.seller_store_catalog_runtime_settings settings
      where settings.singleton = true
    ) as runtime_valido,
    not exists (
      select 1
      from public.seller_store_catalog_exports exports
      where exports.status = 'processing'
        and exports.locked_at < now() - interval '10 minutes'
    ) as sem_jobs_travados,
    not exists (
      select 1
      from public.seller_store_catalog_worker_runs runs
      where runs.status = 'running'
        and runs.started_at < now() - interval '10 minutes'
    ) as sem_execucoes_orfas,
    not exists (
      select 1
      from public.seller_store_catalog_exports exports
      where exports.status = 'ready'
        and (
          exports.storage_path is null
          or exports.file_size_bytes is null
          or exports.page_count is null
          or exports.completed_at is null
        )
    ) as catalogos_prontos_validos
),
metrics as (
  select
    settings.processing_enabled as processamento_ativo,
    settings.max_batch_size as tamanho_lote,
    settings.failure_threshold as limite_falhas,
    settings.consecutive_failures as falhas_consecutivas,
    settings.paused_reason as motivo_pausa,
    settings.last_success_at as ultimo_sucesso,
    count(*) filter (where exports.status = 'queued')::integer as na_fila,
    count(*) filter (where exports.status = 'processing')::integer as processando,
    count(*) filter (
      where exports.status = 'ready'
        and exports.completed_at >= now() - interval '24 hours'
    )::integer as prontos_24h,
    count(*) filter (
      where exports.status = 'failed'
        and exports.completed_at >= now() - interval '24 hours'
    )::integer as falhas_24h,
    min(exports.created_at) filter (where exports.status = 'queued') as pedido_mais_antigo
  from public.seller_store_catalog_runtime_settings settings
  left join public.seller_store_catalog_exports exports on true
  where settings.singleton = true
  group by settings.singleton, settings.processing_enabled, settings.max_batch_size,
    settings.failure_threshold, settings.consecutive_failures, settings.paused_reason,
    settings.last_success_at
)
select
  readiness.estrutura_completa,
  readiness.contratos_completos,
  readiness.bucket_privado,
  readiness.bucket_sem_policy_browser,
  readiness.runtime_valido,
  readiness.sem_jobs_travados,
  readiness.sem_execucoes_orfas,
  readiness.catalogos_prontos_validos,
  (
    readiness.estrutura_completa
    and readiness.contratos_completos
    and readiness.bucket_privado
    and readiness.bucket_sem_policy_browser
    and readiness.runtime_valido
    and readiness.sem_jobs_travados
    and readiness.sem_execucoes_orfas
    and readiness.catalogos_prontos_validos
  ) as pronto_para_operar,
  metrics.*
from readiness
cross join metrics;
