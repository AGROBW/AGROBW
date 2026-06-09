-- =====================================================================
-- FIX — Upload em ads-images voltou a falhar (RLS) após o hardening de storage
-- Data: 2026-06-08
-- =====================================================================
-- Causa: SECURITY_FIX_STORAGE_2026-06-07 dropou a policy de INSERT "frouxa"
-- (`Users can upload ads images`, with_check só role=authenticated). As policies
-- de INSERT que sobraram exigem que a pasta-raiz seja o auth.uid(), MAS o app
-- envia para:
--   <userSlug>/<categorySlug>/<subCategorySlug>/<13díg>-<uid>-<nome>
-- (pasta-raiz = userSlug, NÃO o uid) -> INSERT viola RLS.
--
-- NÃO foi introduzido pelo lote atual (R1/R2/EXPAND/SWITCH). Veio do hardening
-- de storage anterior. Correção: policy de INSERT segura, ancorada no uid que o
-- app já embute no NOME do arquivo (`-<uid>-`).
--
-- NÃO aplicar automaticamente. Transacional + idempotente.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. DIAGNÓSTICO (rode antes para ver o estado vivo das policies de ads-images)
-- ---------------------------------------------------------------------
-- select policyname, cmd, roles, qual, with_check
-- from pg_policies
-- where schemaname='storage' and tablename='objects'
--   and (qual ilike '%ads-images%' or with_check ilike '%ads-images%')
-- order by cmd, policyname;
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id='ads-images';

begin;

-- ---------------------------------------------------------------------
-- 1. Policy de INSERT que casa o path real (uid no nome) — owner via uid
-- ---------------------------------------------------------------------
drop policy if exists "ads_images_insert_own_v2" on storage.objects;
create policy "ads_images_insert_own_v2" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'ads-images'
    -- o app sempre embute "-<uid>-" no nome do arquivo enviado
    and position(('-' || auth.uid()::text || '-') in name) > 0
  );

commit;

-- =====================================================================
-- VERIFICAÇÃO
-- =====================================================================
-- a) policy criada:
-- select policyname, with_check from pg_policies
-- where schemaname='storage' and tablename='objects' and policyname='ads_images_insert_own_v2';
--
-- b) TESTE FUNCIONAL: criar anúncio com imagem (autenticado) -> upload 200, sem RLS error.
--
-- c) Segurança mantida: anon não envia (policy é TO authenticated); imagens de
--    anúncio já são públicas para leitura por design. O uid no nome amarra o
--    upload ao usuário autenticado da sessão.
--
-- ROLLBACK: drop policy if exists "ads_images_insert_own_v2" on storage.objects;
--
-- OBS (mime): se após o fix de RLS aparecer erro de MIME (não foi o caso aqui —
-- o erro era RLS), revisar storage.buckets.allowed_mime_types de 'ads-images'.
-- =====================================================================
