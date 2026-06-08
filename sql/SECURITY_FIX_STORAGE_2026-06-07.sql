-- =====================================================================
-- SECURITY FIX — STORAGE (buckets/policies de uploads)
-- Data: 2026-06-07
-- =====================================================================
-- Fecha:
--   S-CRIT-1  verification_docs: leitura cruzada de documentos de identidade
--             (policies por slug do nome). Passa a depender de auth.uid()=owner.
--   S-HIGH-1  verification_docs: INSERT frouxo (sem escopo de pasta).
--   S-HIGH-2  avatars: policy ALL/INSERT frouxa (qualquer autenticado escrevia
--             qualquer avatar). Passa a uid-scoped.
--   S-MED-1   ads-images: INSERT frouxo + bucket sem limite/MIME.
--
-- NÃO mexe em layout_assets (svg/favicon é dependência real do painel).
-- Idempotente e transacional. Você executa no Supabase SQL Editor.
--
-- IMPORTANTE: dropar as policies por slug fecha S-CRIT-1 IMEDIATAMENTE, mesmo
-- com arquivos legados em pastas de slug — a leitura passa a ser por `owner`.
-- Pré-cheque recomendado (rode antes; owner deve estar preenchido):
--   select bucket_id,
--          count(*) filter (where owner is null) as sem_owner, count(*) as total
--   from storage.objects
--   where bucket_id in ('verification_docs','avatars') group by bucket_id;
-- =====================================================================

begin;

-- =====================================================================
-- 1. verification_docs  (S-CRIT-1 / S-HIGH-1)
-- =====================================================================
-- 1.1 Remover policies inseguras (slug + INSERT frouxa)
drop policy if exists "Usuários podem ver seus documentos"     on storage.objects; -- slug SELECT
drop policy if exists "Usuários podem deletar seus documentos"  on storage.objects; -- slug DELETE
drop policy if exists "Usuários podem fazer upload de documentos" on storage.objects; -- slug INSERT
drop policy if exists "Upload de Documentos de Verificação"     on storage.objects; -- INSERT frouxa

-- 1.2 Garantir leitura segura do dono (auth.uid() = owner)
do $$
begin
  if not exists (select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='Visualização de Documentos Próprios') then
    execute $p$
      create policy "Visualização de Documentos Próprios" on storage.objects
        for select to authenticated
        using (bucket_id = 'verification_docs' and auth.uid() = owner)
    $p$;
  end if;
end $$;

-- 1.3 Admin lê tudo — agora exigindo MFA (aal2)
drop policy if exists "Admins podem ver todos os documentos" on storage.objects;
create policy "Admins podem ver todos os documentos" on storage.objects
  for select to authenticated
  using (bucket_id = 'verification_docs' and public.is_admin() = true);

-- 1.4 Escrita uid-scoped (upload na própria pasta) + manutenção do dono
drop policy if exists "verification_docs_insert_own" on storage.objects;
create policy "verification_docs_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification_docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "verification_docs_update_own" on storage.objects;
create policy "verification_docs_update_own" on storage.objects
  for update to authenticated
  using  (bucket_id = 'verification_docs' and auth.uid() = owner)
  with check (bucket_id = 'verification_docs' and auth.uid() = owner);

drop policy if exists "verification_docs_delete_own" on storage.objects;
create policy "verification_docs_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'verification_docs' and auth.uid() = owner);

-- =====================================================================
-- 2. avatars  (S-HIGH-2)
-- =====================================================================
-- 2.1 Remover policies frouxas e por slug
drop policy if exists "Gestão de Avatar Próprio"              on storage.objects; -- ALL frouxa
drop policy if exists "Upload de Avatar por Pasta de Usuário" on storage.objects; -- INSERT frouxa
drop policy if exists "Usuários podem fazer upload de avatares" on storage.objects; -- slug INSERT
drop policy if exists "Usuários podem atualizar seus avatares"  on storage.objects; -- slug UPDATE
drop policy if exists "Usuários podem deletar seus avatares"    on storage.objects; -- slug DELETE
-- Mantém "Avatares são públicos" (SELECT público) — avatares existentes seguem visíveis.

-- 2.2 Escrita uid-scoped
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using  (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- 3. ads-images  (S-MED-1)
-- =====================================================================
-- 3.1 Remover INSERT frouxa (sem escopo de pasta). Mantém as uid-scoped:
--     "Permitir upload para usuários autenticados" (foldername = uid),
--     "Users can upload own ads images", read/delete own, leitura pública.
drop policy if exists "Users can upload ads images" on storage.objects;

-- 3.2 Definir limite de tamanho e MIME do bucket
update storage.buckets
set file_size_limit = 10485760,  -- 10MB
    allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/webp']
where id = 'ads-images';

commit;

-- =====================================================================
-- VERIFICAÇÃO (após COMMIT)
-- =====================================================================
-- -- 4.1 verification_docs não deve mais ter policy por slug:
-- select policyname, cmd, qual, with_check from pg_policies
-- where schemaname='storage' and tablename='objects'
--   and qual||coalesce(with_check,'') ilike '%regexp_replace%';   -- ESPERADO: 0
--
-- -- 4.2 Policies vivas dos buckets corrigidos:
-- select policyname, cmd, roles from pg_policies
-- where schemaname='storage' and tablename='objects'
-- order by policyname;
--
-- -- 4.3 Limites do ads-images:
-- select id, file_size_limit, allowed_mime_types from storage.buckets where id='ads-images';
--
-- TESTES (devem FALHAR após o fix):
--   * Usuário comum renomeia conta p/ slug de vítima e tenta ler verification_docs/<slug>/* -> 0 linhas
--   * Usuário comum tenta deletar avatar de outro -> negado
--   * Upload em ads-images sem pasta = uid -> negado
-- =====================================================================
