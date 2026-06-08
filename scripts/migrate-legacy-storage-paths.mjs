#!/usr/bin/env node
/**
 * Migração de arquivos legados em pasta de SLUG -> pasta por auth.uid() (owner).
 * Buckets: verification_docs, avatars.
 *
 * SEGURANÇA: a correção de policy (sql/SECURITY_FIX_STORAGE_2026-06-07.sql) JÁ
 * fecha o vazamento (leitura passa a ser por owner). Este script é HIGIENE:
 * normaliza os caminhos físicos e atualiza referências (users.avatar /
 * users.document_path), para que os donos voltem a gerenciar os arquivos antigos
 * e as pastas de slug deixem de existir.
 *
 * Mapeamento é feito SEMPRE pela coluna `owner` (determinístico) — NUNCA pelo
 * slug (ambíguo). Objetos sem `owner` são pulados e listados para tratamento manual.
 *
 * Uso:
 *   # 1) DRY-RUN (padrão) — só mostra o que faria, não altera nada:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/migrate-legacy-storage-paths.mjs
 *
 *   # 2) APLICAR de verdade:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... MIGRATE_APPLY=1 node scripts/migrate-legacy-storage-paths.mjs
 *
 * Requisitos: @supabase/supabase-js (já é dependência do projeto).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APPLY = process.env.MIGRATE_APPLY === '1';
const BUCKETS = ['verification_docs', 'avatars'];

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const log = (...a) => console.log(...a);

async function listLegacyObjects(bucket) {
  // O schema storage não fica exposto diretamente via PostgREST.
  // Por isso usamos uma RPC temporária criada no SQL Editor.
  const { data, error } = await supabase
    .rpc('list_legacy_storage_objects', { p_bucket: bucket });

  if (error) throw new Error(`Falha ao listar ${bucket}: ${error.message}`);

  return (data || [])
    .map((row) => {
      const name = row.name || '';
      const firstFolder = name.split('/')[0] || '';
      return { name, owner: row.owner, firstFolder };
    })
    .filter((o) => o.name && o.firstFolder && !UUID_RE.test(o.firstFolder));
}

async function updateReferences(bucket, oldName, newName, owner) {
  if (bucket === 'avatars') {
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(newName);
    const newUrl = pub?.publicUrl;
    if (newUrl) {
      await supabase
        .from('users')
        .update({ avatar: newUrl })
        .eq('id', owner)
        .ilike('avatar', `%${oldName}%`);
    }
  } else if (bucket === 'verification_docs') {
    await supabase
      .from('users')
      .update({ document_path: newName })
      .eq('id', owner)
      .eq('document_path', oldName);
  }
}

async function run() {
  log(`\n=== Migração legados slug -> owner  (${APPLY ? 'APLICANDO' : 'DRY-RUN'}) ===\n`);
  let totalMove = 0;
  let totalSkipNoOwner = 0;
  let totalConflict = 0;
  let totalErr = 0;

  for (const bucket of BUCKETS) {
    const legacy = await listLegacyObjects(bucket);
    log(`# ${bucket}: ${legacy.length} objeto(s) legado(s) em pasta de slug`);

    for (const obj of legacy) {
      const rest = obj.name.split('/').slice(1).join('/');
      if (!obj.owner) {
        totalSkipNoOwner++;
        log(`  [SEM OWNER - manual] ${bucket}/${obj.name}`);
        continue;
      }
      const newName = `${obj.owner}/${rest}`;
      if (newName === obj.name) continue;

      if (!APPLY) {
        totalMove++;
        log(`  [DRY] ${bucket}/${obj.name}  ->  ${bucket}/${newName}`);
        continue;
      }

      // copy -> update refs -> remove (copy não sobrescreve destino existente)
      const { error: copyErr } = await supabase.storage.from(bucket).copy(obj.name, newName);
      if (copyErr) {
        if (/exists|duplicate/i.test(copyErr.message)) {
          totalConflict++;
          log(`  [CONFLITO destino existe - revisar] ${bucket}/${newName}`);
        } else {
          totalErr++;
          log(`  [ERRO copy] ${bucket}/${obj.name}: ${copyErr.message}`);
        }
        continue;
      }

      try {
        await updateReferences(bucket, obj.name, newName, obj.owner);
      } catch (e) {
        log(`  [AVISO ref] ${bucket}/${obj.name}: ${e.message}`);
      }

      const { error: rmErr } = await supabase.storage.from(bucket).remove([obj.name]);
      if (rmErr) {
        totalErr++;
        log(`  [ERRO remove antigo] ${bucket}/${obj.name}: ${rmErr.message} (cópia já criada em ${newName})`);
        continue;
      }

      totalMove++;
      log(`  [OK] ${bucket}/${obj.name}  ->  ${bucket}/${newName}`);
    }
  }

  log(`\n--- Resumo ---`);
  log(`  Movidos/elegíveis : ${totalMove}`);
  log(`  Sem owner (manual): ${totalSkipNoOwner}`);
  log(`  Conflitos destino : ${totalConflict}`);
  log(`  Erros             : ${totalErr}`);
  if (!APPLY) log(`\n(DRY-RUN — nada foi alterado. Para aplicar: MIGRATE_APPLY=1)`);
}

run().catch((e) => {
  console.error('Falha na migração:', e);
  process.exit(1);
});
