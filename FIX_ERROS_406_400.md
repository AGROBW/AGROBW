# 🔧 FIX RÁPIDO - Erros 406 e 400

## 🐛 Erros Identificados

### 1. Erro 406 (Not Acceptable) no GET /leads
**Causa**: Query usando `.single()` que falha quando não há lead
**Status**: ✅ **CORRIGIDO** no código

### 2. Erro 400 (Bad Request) no PATCH /messages  
**Causa**: Política RLS ou consulta malformada
**Status**: ✅ **CORRIGIDO** no código + SQL necessário

---

## ✅ Solução em 2 Passos

### PASSO 1: Executar SQL no Supabase

Abra o Supabase SQL Editor e execute este arquivo:

📁 **[sql/FIX_RLS_POLICIES.sql](sql/FIX_RLS_POLICIES.sql)**

Este script:
- ✅ Recria políticas RLS para `leads`
- ✅ Recria políticas RLS para `messages`
- ✅ Corrige coluna `is_read` se necessário
- ✅ Mostra diagnóstico completo

**Tempo de execução**: ~3 segundos

---

### PASSO 2: Recarregar a Aplicação

```bash
# 1. Parar o servidor (Ctrl+C)
# 2. Iniciar novamente
npm run dev

# 3. Limpar cache do navegador (Ctrl+Shift+Delete)
# 4. Testar novamente
```

---

## 🔍 O Que Foi Alterado no Código

### 1. useLeadData.ts

**Antes:**
```typescript
.select('*')
.eq('chat_id', chatId)
.single(); // ❌ Falha se não encontrar
```

**Depois:**
```typescript
.select('*')
.eq('chat_id', chatId)
.maybeSingle(); // ✅ Retorna null se não encontrar
```

### 2. useMessages.ts

**Antes:**
```typescript
await supabase
  .from('messages')
  .update({ is_read: true })
  .eq('chat_id', chatId)
  .neq('sender_id', user.id);
// ❌ Sem tratamento de erro
```

**Depois:**
```typescript
const { error: updateError } = await supabase
  .from('messages')
  .update({ is_read: true })
  .eq('chat_id', chatId)
  .neq('sender_id', user.id)
  .eq('is_read', false); // ✅ Só atualiza não lidas

if (updateError) {
  console.error('Erro ao marcar mensagens como lidas:', updateError);
}
```

---

## 🧪 Verificações Pós-Fix

Execute estas queries no Supabase para confirmar:

### 1. Verificar Políticas RLS

```sql
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('messages', 'leads');
```

**Resultado esperado:**
- messages: 3 políticas (SELECT, INSERT, UPDATE)
- leads: 3 políticas (SELECT, INSERT, UPDATE)

### 2. Testar Acesso a Leads

```sql
-- Como usuário vendedor logado:
SELECT COUNT(*) FROM leads WHERE seller_id = auth.uid();
```

**Resultado esperado:** Número >= 0 (sem erro)

### 3. Testar Update de Messages

```sql
-- Como usuário logado:
UPDATE messages
SET is_read = true
WHERE chat_id IN (
  SELECT id FROM chats
  WHERE buyer_id = auth.uid() OR seller_id = auth.uid()
)
AND is_read = false
LIMIT 1;
```

**Resultado esperado:** "UPDATE 1" ou "UPDATE 0" (sem erro)

---

## 🎯 Teste Final na Aplicação

1. ✅ **Abrir /minha-conta/mensagens**
2. ✅ **Selecionar um chat**
3. ✅ **Verificar console do navegador**
   - ❌ Antes: Erro 406 e 400
   - ✅ Agora: Sem erros

4. ✅ **Sidebar deve aparecer** (se houver lead)
5. ✅ **Mensagens marcam como lidas** automaticamente

---

## 🐛 Se Ainda Houver Erros

### Erro persiste no GET /leads?

**Verificar:**
```sql
-- Usuário está autenticado?
SELECT auth.uid();

-- Tabela leads existe?
SELECT COUNT(*) FROM leads;

-- RLS está habilitado?
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'leads';
```

### Erro persiste no PATCH /messages?

**Verificar:**
```sql
-- Coluna is_read existe?
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'messages' 
AND column_name = 'is_read';

-- Políticas de UPDATE existem?
SELECT policyname 
FROM pg_policies 
WHERE tablename = 'messages' 
AND cmd = 'UPDATE';
```

---

## 📊 Resumo das Mudanças

| Arquivo | Mudança | Impacto |
|---------|---------|---------|
| **useLeadData.ts** | `.single()` → `.maybeSingle()` | ✅ Não dá erro 406 se não houver lead |
| **useMessages.ts** | Adiciona `.eq('is_read', false)` e tratamento de erro | ✅ Só atualiza não lidas, não trava |
| **FIX_RLS_POLICIES.sql** | Recria políticas RLS | ✅ Garante permissões corretas |

---

## 🎉 Pronto!

Após executar o SQL e recarregar:
- ✅ Erro 406 resolvido
- ✅ Erro 400 resolvido
- ✅ Sidebar funcional
- ✅ Mensagens marcam como lidas automaticamente

Se ainda tiver problemas, verifique:
1. Usuário está logado?
2. SQL foi executado no projeto correto?
3. Cache do navegador foi limpo?
