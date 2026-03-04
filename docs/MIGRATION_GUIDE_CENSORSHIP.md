# 🔄 Migração: Aplicar Censura em Anúncios Existentes

## 📋 Problema

O trigger de censura só funciona para **novos anúncios** (INSERT) e **atualizações futuras** (UPDATE). Anúncios que já existem no banco **não são afetados automaticamente**.

## ✅ Solução

Script SQL que aplica a censura em **todos os anúncios existentes** de uma vez.

---

## 🚀 Passo a Passo (RECOMENDADO)

### 1️⃣ Backup (Segurança)

Execute primeiro no Supabase SQL Editor:

```sql
-- Criar backup de segurança
CREATE TABLE announcements_backup AS 
SELECT * FROM announcements;

-- Verificar se o backup foi criado
SELECT COUNT(*) FROM announcements_backup;
```

### 2️⃣ Preview (Ver o que será modificado)

```sql
-- Ver os primeiros 20 anúncios que serão censurados
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
```

**Verifique atentamente**:
- ✅ Telefones estão sendo substituídos corretamente?
- ✅ E-mails estão sendo censurados?
- ✅ Links estão sendo removidos?
- ❌ Não está censurando coisas que não deveria? (ex: "ano 2020")

### 3️⃣ Contar Quantos Serão Afetados

```sql
-- Ver estatísticas
SELECT 
  COUNT(*) as total_anuncios,
  COUNT(*) FILTER (WHERE title ~ '\d{10,11}') as com_telefone_titulo,
  COUNT(*) FILTER (WHERE description ~ '\d{10,11}') as com_telefone_descricao,
  COUNT(*) FILTER (WHERE title ~ '@') as com_arroba_titulo,
  COUNT(*) FILTER (WHERE description ~ '@') as com_arroba_descricao
FROM announcements;
```

### 4️⃣ Aplicar a Migração

**Escolha UMA das opções abaixo:**

#### ⚡ OPÇÃO A: Rápida (Dispara o Trigger)

```sql
-- Esta opção é mais rápida mas altera o campo 'updated_at'
DO $$
DECLARE
  total_records INTEGER;
  processed_records INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO total_records FROM announcements;
  RAISE NOTICE 'Iniciando migração de % anúncios...', total_records;
  
  -- Forçar update em todos (trigger censura automaticamente)
  UPDATE announcements
  SET title = title, description = description;
  
  GET DIAGNOSTICS processed_records = ROW_COUNT;
  RAISE NOTICE 'Migração concluída! Processados: %', processed_records;
END $$;
```

**Prós**:
- ✅ Mais rápido (1 comando)
- ✅ Usa o trigger já implementado

**Contras**:
- ❌ Altera o campo `updated_at` de todos os anúncios
- ❌ Pode enviar notificações indesejadas (se houver)

#### 🎯 OPÇÃO B: Controlada (Update Manual)

```sql
-- Esta opção não altera 'updated_at' mas é mais lenta
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
    UPDATE announcements
    SET 
      title = record_data.new_title,
      description = record_data.new_description
    WHERE id = record_data.id;
    
    total_modified := total_modified + 1;
    
    IF total_modified % 50 = 0 THEN
      RAISE NOTICE 'Censurados % anúncios...', total_modified;
      COMMIT; -- Commit parcial
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Concluído! Total modificado: %', total_modified;
END $$;
```

**Prós**:
- ✅ Não altera `updated_at`
- ✅ Mais controle (processa um por um)
- ✅ Log detalhado de progresso

**Contras**:
- ❌ Mais lento (loop)

### 5️⃣ Verificar Resultado

```sql
-- Contar quantos anúncios foram censurados
SELECT COUNT(*) as total_censurados
FROM announcements
WHERE 
  title LIKE '%[CONTATO PROTEGIDO]%' 
  OR description LIKE '%[CONTATO PROTEGIDO]%';

-- Ver exemplos de anúncios censurados
SELECT id, title, LEFT(description, 100) as desc_preview
FROM announcements
WHERE title LIKE '%[CONTATO PROTEGIDO]%'
LIMIT 10;
```

### 6️⃣ Limpar Backup (Se deu certo)

```sql
-- Apenas se você verificou que tudo está correto
DROP TABLE announcements_backup;
```

---

## 🆘 Rollback (Se algo der errado)

Se a migração não funcionou como esperado:

```sql
-- RESTAURAR DO BACKUP
TRUNCATE announcements;
INSERT INTO announcements SELECT * FROM announcements_backup;

-- Verificar se restaurou
SELECT COUNT(*) FROM announcements;

-- Limpar backup
DROP TABLE announcements_backup;
```

---

## 📊 Exemplo de Resultado

### Antes da Migração

```
id: 123e4567-e89b-12d3-a456-426614174000
title: Trator John Deere - Ligue (64) 99342-4812
description: Email: vendedor@fazenda.com ou WhatsApp
```

### Depois da Migração

```
id: 123e4567-e89b-12d3-a456-426614174000
title: Trator John Deere - Ligue [CONTATO PROTEGIDO]
description: Email: [CONTATO PROTEGIDO] ou [CONTATO PROTEGIDO]
```

---

## ⚙️ Opções Avançadas

### Ver Apenas Anúncios com Telefone

```sql
SELECT id, title, description
FROM announcements
WHERE title ~ '\d{10,11}' OR description ~ '\d{10,11}'
LIMIT 10;
```

### Aplicar Censura Apenas em ACTIVE

```sql
-- Censurar apenas anúncios ativos
UPDATE announcements
SET title = title, description = description
WHERE status = 'ACTIVE';
```

### Migração por Categoria

```sql
-- Censurar apenas uma categoria específica
UPDATE announcements
SET title = title, description = description
WHERE category_id = 'uuid-da-categoria';
```

---

## 🎯 Recomendação Pessoal

**Use OPÇÃO B (Controlada)** se:
- ✅ Você quer manter o histórico de `updated_at` correto
- ✅ Seu banco tem menos de 10.000 anúncios
- ✅ Você quer logs detalhados do processo

**Use OPÇÃO A (Rápida)** se:
- ✅ Você não se importa com `updated_at`
- ✅ Seu banco tem muitos anúncios (>10.000)
- ✅ Você quer terminar rápido

---

## 📁 Arquivos

- **Script Completo**: [sql/migrate_existing_announcements_censorship.sql](../sql/migrate_existing_announcements_censorship.sql)
- **Trigger Principal**: [sql/censor_contact_trigger.sql](../sql/censor_contact_trigger.sql)
- **Documentação**: [docs/CONTACT_CENSORSHIP.md](CONTACT_CENSORSHIP.md)

---

## ✅ Checklist Final

Após executar a migração, verifique:

- [ ] Backup criado
- [ ] Preview executado e validado
- [ ] Migração executada sem erros
- [ ] Verificação mostra anúncios censurados
- [ ] Não há mais telefones/e-mails expostos
- [ ] Backup removido (se tudo ok)
- [ ] Trigger ainda está ativo (para novos anúncios)

---

## 🎉 Pronto!

Após executar a migração, **todos os anúncios existentes** estarão protegidos e **novos anúncios** serão censurados automaticamente pelo trigger.

**Tempo estimado**: 1-5 minutos (depende do número de anúncios)
