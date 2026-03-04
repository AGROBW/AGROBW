-- ============================================
-- MIGRAÇÃO: Aplicar Censura em Anúncios Existentes
-- ============================================

-- Este script aplica a censura de contatos em todos os anúncios
-- já existentes no banco de dados.

-- ============================================
-- IMPORTANTE: BACKUP ANTES DE EXECUTAR
-- ============================================

-- Faça backup dos dados antes de executar (recomendado):
/*
CREATE TABLE announcements_backup AS
SELECT * FROM announcements;
*/

-- ============================================
-- OPÇÃO 1: Update Automático (Dispara o Trigger)
-- ============================================

-- Esta abordagem força um UPDATE em todos os anúncios,
-- o que dispara automaticamente o trigger de censura.

-- ATENÇÃO: Isso vai atualizar o campo 'updated_at' de todos os anúncios

DO $$
DECLARE
  total_records INTEGER;
  processed_records INTEGER := 0;
  batch_size INTEGER := 100;
  announcement_record RECORD;
BEGIN
  -- Contar total de anúncios
  SELECT COUNT(*) INTO total_records FROM announcements;
  
  RAISE NOTICE 'Iniciando migração de % anúncios...', total_records;
  
  -- Processar em lotes para evitar lock longo
  FOR announcement_record IN 
    SELECT id, title, description 
    FROM announcements 
    ORDER BY created_at DESC
  LOOP
    -- Forçar update (trigger vai censurar automaticamente)
    UPDATE announcements
    SET 
      title = title,
      description = description
    WHERE id = announcement_record.id;
    
    processed_records := processed_records + 1;
    
    -- Log de progresso a cada 100 registros
    IF processed_records % batch_size = 0 THEN
      RAISE NOTICE 'Processados % de % anúncios (%.1f%%)', 
        processed_records, 
        total_records,
        (processed_records::FLOAT / total_records::FLOAT * 100);
      
      -- Commit parcial (libera locks)
      COMMIT;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Migração concluída! Total processado: %', processed_records;
END $$;

-- ============================================
-- OPÇÃO 2: Update Manual (Sem Disparar Trigger)
-- ============================================

-- Se você não quiser disparar o trigger e alterar o 'updated_at',
-- pode aplicar a censura manualmente com esta função:

CREATE OR REPLACE FUNCTION apply_censorship_to_existing_announcements()
RETURNS TABLE(
  id UUID,
  old_title TEXT,
  new_title TEXT,
  old_description TEXT,
  new_description TEXT,
  was_modified BOOLEAN
) AS $$
DECLARE
  replacement_text TEXT := '[CONTATO PROTEGIDO]';
  announcement_record RECORD;
  new_title_value TEXT;
  new_description_value TEXT;
  was_changed BOOLEAN;
BEGIN
  FOR announcement_record IN 
    SELECT a.id, a.title, a.description 
    FROM announcements a
    ORDER BY a.created_at DESC
  LOOP
    -- Aplicar censura
    new_title_value := announcement_record.title;
    new_description_value := announcement_record.description;
    
    -- Telefones
    new_title_value := regexp_replace(new_title_value, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, '\y\d{10,11}\y', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\y\d{10,11}\y', replacement_text, 'gi');
    
    -- E-mails
    new_title_value := regexp_replace(new_title_value, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
    
    -- Links
    new_title_value := regexp_replace(new_title_value, 'https?://[^\s]+', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, 'https?://[^\s]+', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, 'www\.[^\s]+', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, 'www\.[^\s]+', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
    
    -- Redes sociais
    new_title_value := regexp_replace(new_title_value, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
    
    new_title_value := regexp_replace(new_title_value, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
    new_description_value := regexp_replace(new_description_value, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
    
    -- Verificar se houve mudança
    was_changed := (new_title_value != announcement_record.title OR new_description_value != announcement_record.description);
    
    -- Retornar resultado
    id := announcement_record.id;
    old_title := announcement_record.title;
    new_title := new_title_value;
    old_description := announcement_record.description;
    new_description := new_description_value;
    was_modified := was_changed;
    
    RETURN NEXT;
    
    -- Aplicar mudança se necessário (descomente para executar)
    -- IF was_changed THEN
    --   UPDATE announcements
    --   SET title = new_title_value, description = new_description_value
    --   WHERE announcements.id = announcement_record.id;
    -- END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- OPÇÃO 3: Preview (Ver o que será modificado)
-- ============================================

-- RECOMENDADO: Execute primeiro esta query para ver o que será alterado
SELECT 
  id,
  old_title,
  new_title,
  old_description,
  new_description,
  was_modified
FROM apply_censorship_to_existing_announcements()
WHERE was_modified = true
LIMIT 20;

-- Resultado:
-- - Mostra os primeiros 20 anúncios que serão modificados
-- - Compara o texto original com o censurado
-- - Permite validar antes de aplicar

-- ============================================
-- OPÇÃO 4: Aplicar Censura de Verdade
-- ============================================

-- Depois de validar, execute esta query para aplicar as mudanças:

DO $$
DECLARE
  total_modified INTEGER := 0;
  record_data RECORD;
BEGIN
  RAISE NOTICE 'Iniciando aplicação da censura...';
  
  FOR record_data IN 
    SELECT * FROM apply_censorship_to_existing_announcements()
    WHERE was_modified = true
  LOOP
    -- Aplicar mudança
    UPDATE announcements
    SET 
      title = record_data.new_title,
      description = record_data.new_description
    WHERE id = record_data.id;
    
    total_modified := total_modified + 1;
    
    -- Log a cada 50 registros
    IF total_modified % 50 = 0 THEN
      RAISE NOTICE 'Censurados % anúncios até agora...', total_modified;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Censura aplicada com sucesso! Total de anúncios modificados: %', total_modified;
END $$;

-- ============================================
-- VERIFICAÇÃO: Contar anúncios com contatos
-- ============================================

-- Antes de executar a migração, veja quantos anúncios têm contatos:

SELECT 
  COUNT(*) as total_com_contatos,
  COUNT(*) FILTER (WHERE title ~ '\d{10,11}') as com_telefone_titulo,
  COUNT(*) FILTER (WHERE description ~ '\d{10,11}') as com_telefone_descricao,
  COUNT(*) FILTER (WHERE title ~ '@') as com_arroba_titulo,
  COUNT(*) FILTER (WHERE description ~ '@') as com_arroba_descricao,
  COUNT(*) FILTER (WHERE description ~ 'www\.') as com_link_descricao
FROM announcements
WHERE 
  title ~ '\d{10,11}' OR
  description ~ '\d{10,11}' OR
  title ~ '@' OR
  description ~ '@' OR
  description ~ 'www\.' OR
  description ~ 'http';

-- ============================================
-- VERIFICAÇÃO PÓS-MIGRAÇÃO
-- ============================================

-- Após executar a migração, verifique se ainda existem contatos:

SELECT 
  id,
  title,
  description,
  status
FROM announcements
WHERE 
  (title ~ '\d{10,11}' OR description ~ '\d{10,11}')
  AND title NOT LIKE '%[CONTATO PROTEGIDO]%'
LIMIT 10;

-- Resultado esperado: 0 linhas (ou apenas falsos positivos como "ano 2020")

-- ============================================
-- ROLLBACK (se necessário)
-- ============================================

-- Se precisar reverter (apenas se fez backup):
/*
TRUNCATE announcements;
INSERT INTO announcements SELECT * FROM announcements_backup;
DROP TABLE announcements_backup;
*/

-- ============================================
-- RECOMENDAÇÃO: PASSO A PASSO
-- ============================================

/*
PASSO 1: Backup (segurança)
CREATE TABLE announcements_backup AS SELECT * FROM announcements;

PASSO 2: Preview (ver o que será modificado)
SELECT * FROM apply_censorship_to_existing_announcements() WHERE was_modified = true LIMIT 20;

PASSO 3: Aplicar (executar migração)
-- Use a OPÇÃO 1 ou OPÇÃO 4 acima

PASSO 4: Verificar (conferir resultado)
SELECT COUNT(*) FROM announcements WHERE title LIKE '%[CONTATO PROTEGIDO]%' OR description LIKE '%[CONTATO PROTEGIDO]%';

PASSO 5: Limpar (remover backup se deu certo)
DROP TABLE announcements_backup;
*/

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
1. A OPÇÃO 1 é mais simples mas altera o campo 'updated_at'
2. A OPÇÃO 2 permite mais controle mas é mais complexa
3. SEMPRE faça backup antes de executar
4. Execute o Preview primeiro para validar
5. O trigger já está ativo, novos anúncios serão censurados automaticamente
6. Esta migração é necessária apenas UMA VEZ para os dados existentes
*/
