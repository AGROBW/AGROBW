-- ============================================
-- Sistema de Censura Automática de Contatos
-- Trigger BEFORE INSERT/UPDATE em announcements
-- ============================================

-- FUNÇÃO: censor_contact_data
-- Censura telefones, e-mails e links em title e description
CREATE OR REPLACE FUNCTION censor_contact_data()
RETURNS TRIGGER AS $$
DECLARE
  replacement_text TEXT := '[CONTATO PROTEGIDO]';
  original_title TEXT;
  original_description TEXT;
BEGIN
  -- Armazenar valores originais
  original_title := NEW.title;
  original_description := NEW.description;
  
  -- ============================================
  -- CENSURA DE TELEFONES
  -- ============================================
  
  -- Formato: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
  NEW.title := regexp_replace(NEW.title, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  
  -- Formato: XX XXXXX-XXXX ou XX XXXX-XXXX (com espaços)
  NEW.title := regexp_replace(NEW.title, '\y\d{2,3}\s+\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y\d{2,3}\s+\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  
  -- Formato: XXXXXXXXXXX (11 dígitos) ou XXXXXXXXXX (10 dígitos)
  NEW.title := regexp_replace(NEW.title, '\y\d{10,11}\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y\d{10,11}\y', replacement_text, 'gi');
  
  -- Formato internacional: +55 XX XXXXX-XXXX
  NEW.title := regexp_replace(NEW.title, '\+55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\+55\s*\(?\d{2,3}\)?\s*\d{4,5}[-\s]?\d{4}', replacement_text, 'gi');
  
  -- Formato com zero na frente: 0XX XXXXX-XXXX
  NEW.title := regexp_replace(NEW.title, '\y0\d{2,3}\s*\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y0\d{2,3}\s*\d{4,5}[-\s]?\d{4}\y', replacement_text, 'gi');
  
  -- ============================================
  -- CENSURA DE E-MAILS
  -- ============================================
  
  -- Formato: usuario@provedor.com.br
  NEW.title := regexp_replace(NEW.title, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', replacement_text, 'gi');
  
  -- ============================================
  -- CENSURA DE LINKS E URLs
  -- ============================================
  
  -- URLs com protocolo (http:// ou https://)
  NEW.title := regexp_replace(NEW.title, 'https?://[^\s]+', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, 'https?://[^\s]+', replacement_text, 'gi');
  
  -- URLs iniciando com www
  NEW.title := regexp_replace(NEW.title, 'www\.[^\s]+', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, 'www\.[^\s]+', replacement_text, 'gi');
  
  -- Domínios genéricos (site.com, site.com.br)
  NEW.title := regexp_replace(NEW.title, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y[a-zA-Z0-9-]+\.(com|net|org|br|gov\.br|edu\.br|app|io|co|xyz|online|site|store|shop|blog|com\.br)\y', replacement_text, 'gi');
  
  -- ============================================
  -- CENSURA DE REDES SOCIAIS
  -- ============================================
  
  -- Menções com @ (ex: @usuario)
  NEW.title := regexp_replace(NEW.title, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '@[a-zA-Z0-9._]+', replacement_text, 'gi');
  
  -- Nomes de redes sociais (menções diretas)
  NEW.title := regexp_replace(NEW.title, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '\y(instagram|insta|facebook|face|whatsapp|whats|zap|telegram|tele|discord|twitter|tiktok|linkedin)\y', replacement_text, 'gi');
  
  -- URLs de redes sociais específicas
  NEW.title := regexp_replace(NEW.title, '(instagram\.com|facebook\.com|fb\.com|wa\.me|t\.me|discord\.gg|twitter\.com|tiktok\.com|linkedin\.com)/[^\s]*', replacement_text, 'gi');
  NEW.description := regexp_replace(NEW.description, '(instagram\.com|facebook\.com|fb\.com|wa\.me|t\.me|discord\.gg|twitter\.com|tiktok\.com|linkedin\.com)/[^\s]*', replacement_text, 'gi');
  
  -- ============================================
  -- LOG (opcional): Registrar se houve censura
  -- ============================================
  
  IF NEW.title != original_title OR NEW.description != original_description THEN
    RAISE NOTICE 'Censura aplicada no anúncio ID: % (user: %)', NEW.id, NEW.user_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- COMENTÁRIO DA FUNÇÃO
COMMENT ON FUNCTION censor_contact_data() IS 
'Censura automática de telefones, e-mails e links em title e description de announcements. '
'Gatilho executado BEFORE INSERT OR UPDATE para garantir proteção mesmo sem JavaScript.';

-- ============================================
-- TRIGGER: censor_announcements_contact
-- ============================================

DROP TRIGGER IF EXISTS censor_announcements_contact ON announcements;

CREATE TRIGGER censor_announcements_contact
  BEFORE INSERT OR UPDATE OF title, description
  ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION censor_contact_data();

-- COMENTÁRIO DO TRIGGER
COMMENT ON TRIGGER censor_announcements_contact ON announcements IS 
'Trigger que censura automaticamente dados de contato (telefones, e-mails, links) '
'nos campos title e description antes de INSERT ou UPDATE. '
'Garante proteção da plataforma mesmo se o frontend for burlado.';

-- ============================================
-- TESTE DO TRIGGER
-- ============================================

-- Para testar, execute (em ambiente de DEV):
/*
-- Teste 1: Telefone no título
INSERT INTO announcements (title, description, user_id, category_id, price, status)
VALUES ('Trator à venda - 64 99342-4812', 'Descrição teste', 'uuid-do-usuario', 'uuid-da-categoria', 50000, 'DRAFT')
RETURNING title, description;

-- Resultado esperado: title = 'Trator à venda - [CONTATO PROTEGIDO]'

-- Teste 2: E-mail na descrição
INSERT INTO announcements (title, description, user_id, category_id, price, status)
VALUES ('Colheitadeira', 'Entre em contato: vendedor@email.com', 'uuid-do-usuario', 'uuid-da-categoria', 100000, 'DRAFT')
RETURNING title, description;

-- Resultado esperado: description = 'Entre em contato: [CONTATO PROTEGIDO]'

-- Teste 3: Link na descrição
INSERT INTO announcements (title, description, user_id, category_id, price, status)
VALUES ('Pulverizador', 'Mais fotos em www.meusite.com', 'uuid-do-usuario', 'uuid-da-categoria', 20000, 'DRAFT')
RETURNING title, description;

-- Resultado esperado: description = 'Mais fotos em [CONTATO PROTEGIDO]'

-- Teste 4: Rede social
INSERT INTO announcements (title, description, user_id, category_id, price, status)
VALUES ('Grade Aradora', 'Me siga no instagram @vendedor', 'uuid-do-usuario', 'uuid-da-categoria', 15000, 'DRAFT')
RETURNING title, description;

-- Resultado esperado: description = 'Me siga no [CONTATO PROTEGIDO]'

-- Limpar testes:
DELETE FROM announcements WHERE status = 'DRAFT' AND title LIKE '%teste%';
*/

-- ============================================
-- VERIFICAÇÃO
-- ============================================

-- Confirmar que o trigger foi criado:
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'censor_announcements_contact';

-- Resultado esperado: 1 linha mostrando o trigger ativo

-- ============================================
-- ROLLBACK (se necessário desativar)
-- ============================================

-- Para desativar o trigger temporariamente:
-- ALTER TABLE announcements DISABLE TRIGGER censor_announcements_contact;

-- Para reativar:
-- ALTER TABLE announcements ENABLE TRIGGER censor_announcements_contact;

-- Para remover completamente:
-- DROP TRIGGER IF EXISTS censor_announcements_contact ON announcements;
-- DROP FUNCTION IF EXISTS censor_contact_data();

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
1. O campo 'whatsapp' da tabela announcements NÃO é afetado por este trigger,
   pois é usado para o botão oficial de contato da plataforma.

2. A censura ocorre ANTES de salvar no banco (BEFORE trigger), garantindo
   que mesmo requisições diretas via API sejam protegidas.

3. O trigger usa RAISE NOTICE para logar censuras no log do Postgres,
   útil para auditoria e monitoramento.

4. Regex do PostgreSQL usa '\y' para word boundary (equivalente a '\b' em outras engines).

5. Performance: O trigger é eficiente e não afeta significativamente o tempo
   de INSERT/UPDATE, pois usa regex nativas do Postgres.

6. Compatibilidade: Testado em PostgreSQL 12+ (Supabase usa 15+).
*/
