# 🚨 CORREÇÃO URGENTE - Tabelas Não Criadas

## Problema Identificado
As tabelas `leads` e `notifications` não existem ou estão com schema errado.

---

## ✅ SOLUÇÃO RÁPIDA (5 minutos)

### Passo 1: Abrir Supabase SQL Editor
1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto: `dockpbyzrvgewgdoaibn`
3. Menu lateral: **SQL Editor**
4. Clique em: **New query**

---

### Passo 2: Executar Script de Diagnóstico

Cole e execute:
```sql
-- Verificar se as tabelas existem
SELECT 
  'chats' as tabela,
  EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'chats') as existe
UNION ALL 
SELECT 'messages', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages')
UNION ALL 
SELECT 'leads', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads')
UNION ALL 
SELECT 'notifications', EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications');
```

**Resultado esperado:** Todas devem retornar `TRUE`

---

### Passo 3: SE ALGUMA RETORNAR FALSE

Execute os 3 scripts NA ORDEM:

#### Script 1: Criar Tabelas
```bash
# Abra o arquivo:
sql/create_chat_tables.sql

# Cole TODO o conteúdo no SQL Editor
# Clique RUN ▶️
```

#### Script 2: Criar Triggers
```bash
# Abra o arquivo:
sql/create_chat_triggers.sql

# Cole TODO o conteúdo no SQL Editor
# Clique RUN ▶️
```

#### Script 3: Criar VIEW
```bash
# Abra o arquivo:
sql/create_chats_view.sql

# Cole TODO o conteúdo no SQL Editor
# Clique RUN ▶️
```

---

### Passo 4: SE AS TABELAS EXISTEM MAS DÃO ERRO

Execute o script de correção:
```bash
# Abra o arquivo:
sql/fix_schema_columns.sql

# Cole TODO o conteúdo no SQL Editor
# Clique RUN ▶️
```

Este script irá:
- ✅ Adicionar coluna `buyer_cep` em `leads` (se não existir)
- ✅ Adicionar coluna `message` em `notifications` (se não existir)

---

### Passo 5: Verificação Final

Execute novamente o diagnóstico:
```sql
-- Verificar colunas de leads
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;

-- Deve retornar 13 colunas incluindo: buyer_cep

-- Verificar colunas de notifications
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;

-- Deve retornar 8 colunas incluindo: message
```

---

### Passo 6: Testar Novamente no Frontend

1. Recarregue a página (F5)
2. Acesse um anúncio
3. Clique "Fale com o Vendedor"
4. Preencha e envie
5. ✅ **Deve funcionar sem erros**

---

## 📋 Checklist

- [ ] Abri o Supabase SQL Editor
- [ ] Executei o diagnóstico (SELECT ... EXISTS)
- [ ] Todas as tabelas retornaram TRUE
- [ ] Se FALSE: Executei create_chat_tables.sql
- [ ] Se FALSE: Executei create_chat_triggers.sql
- [ ] Se FALSE: Executei create_chats_view.sql
- [ ] Se tabelas existem mas erro: Executei fix_schema_columns.sql
- [ ] Verifiquei que todas as colunas existem
- [ ] Testei no frontend e funcionou

---

## 🐛 Se Ainda Não Funcionar

Execute este comando para ver o erro exato:
```sql
-- Ver estrutura completa de leads
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'leads'
ORDER BY ordinal_position;

-- Ver estrutura completa de notifications
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notifications'
ORDER BY ordinal_position;
```

Copie e cole o resultado aqui para análise.

---

**Resumo:** Execute os scripts SQL que estão na pasta `sql/` do projeto no Supabase SQL Editor.
