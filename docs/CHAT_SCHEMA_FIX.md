# Correção: Erro 400 ao Criar Chat (ATUALIZADO)

## Problema Identificado

Erro `check_constraint "chats_status_check"` ocorria ao tentar criar um novo chat através do botão "Fale com o Vendedor".

### Causa Raiz

O banco de dados foi configurado para aceitar valores em **PORTUGUÊS** no campo `status`, mas o código estava tentando enviar valores em **INGLÊS**, causando violação do constraint.

### Valores Corretos (Banco de Dados em Português)

```sql
status TEXT CHECK (status IN ('novo', 'contatado', 'negociando', 'fechado', 'perdido'))
```

| Português | ~~Inglês (Errado)~~ | Significado |
|-----------|---------------------|-------------|
| `novo` | ~~new~~ | Lead novo, ainda não contatado |
| `contatado` | ~~contacted~~ | Vendedor já entrou em contato |
| `negociando` | ~~negotiating~~ | Em processo de negociação |
| `fechado` | ~~closed~~ | Venda concluída com sucesso |
| `perdido` | ~~lost~~ | Negociação não prosperou |

## Estrutura Real da Tabela `chats`

```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY,
  announcement_id UUID REFERENCES announcements(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
  status TEXT DEFAULT 'novo' CHECK (status IN ('novo', 'contatado', 'negociando', 'fechado', 'perdido')),
  last_message TEXT,
  last_message_time TIMESTAMPTZ,
  unread_count_buyer INTEGER DEFAULT 0,
  unread_count_seller INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_chat_per_announcement UNIQUE (announcement_id, buyer_id, seller_id),
  CONSTRAINT buyer_seller_different CHECK (buyer_id != seller_id)
);
```

**Campo crítico**: `status TEXT DEFAULT 'novo'` com constraint `CHECK (status IN ('novo', 'contatado', 'negociando', 'fechado', 'perdido'))`

## Correções Implementadas

### 1. ContactSellerModal.tsx

**Antes (❌ causava erro 400)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: user.id,
  seller_id: sellerId,
  // ❌ Campo ausente ou valor em inglês!
})
```

**Depois (✅ funciona)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: user.id,
  seller_id: sellerId,
  status: 'novo',  // ✅ Valor correto em português
  last_message: formData.message,
  last_message_time: new Date().toISOString()
})
```

### 2. ContactModal.tsx

**Antes (❌ causava erro 400)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: buyerId,
  seller_id: sellerId
  // ❌ Campo ausente!
})
```

**Depois (✅ funciona)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: buyerId,
  seller_id: sellerId,
  status: 'novo'  // ✅ Valor correto em português
})
```

### 3. types.ts - Padronização de Tipos

**Criado tipo ChatStatus em português**:
```typescript
// Status do Chat em Português (conforme banco de dados)
export type ChatStatus = 'novo' | 'contatado' | 'negociando' | 'fechado' | 'perdido';

export interface Chat {
  id: string;
  // ... outros campos
  status: ChatStatus;  // ✅ Usando o tipo correto
  // ...
}
```

### 4. MessageCard.tsx - Badge de Lead

**Atualizado para valor em português**:
```typescript
{chat.status === 'novo' && isSeller && (
  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
    Lead Novo
  </span>
)}
```

### 3. Tratamento de Erros Melhorado

Adicionado tratamento robusto para diferentes tipos de erro:

```typescript
if (chatError) {
  console.error('[Chat] Erro ao criar chat:', chatError);
  console.error('[Chat] Detalhes do erro:', JSON.stringify(chatError, null, 2));
  
  let errorMessage = 'Não foi possível iniciar a conversa.';
  
  // Erro de duplicação (chat já existe)
  if (chatError.code === '23505') {
    errorMessage = 'Você já possui uma conversa aberta para este anúncio.';
  } 
  // Erro de referência (FK inválida)
  else if (chatError.code === '23503') {
    errorMessage = 'Dados inválidos. Por favor, recarregue a página e tente novamente.';
  } 
  // Erro de constraint genérico
  else if (chatError.message?.includes('constraint')) {
    errorMessage = 'Erro de validação. Verifique seus dados e tente novamente.';
  }
  
  toast.error(errorMessage);
  setIsSubmitting(false);
  return;
}
```

## Códigos de Erro PostgreSQL

| Código | Significado | Mensagem Amigável |
|--------|-------------|-------------------|
| `23505` | Unique violation | "Você já possui uma conversa aberta para este anúncio" |
| `23503` | Foreign key violation | "Dados inválidos. Recarregue a página" |
| `23514` | Check constraint violation | "Erro de validação dos dados" |

## Campos Obrigatórios para Criar Chat

```typescript
{
  announcement_id: string,  // UUID do anúncio
  buyer_id: string,         // UUID do comprador (auth.uid())
  seller_id: string,        // UUID do vendedor (dono do anúncio)
  status: 'novo'            // ✅ Status inicial em português
}
```

**Campos opcionais** (preenchidos automaticamente):
- `id` - gerado pelo banco
- `created_at` - timestamp automático
- `updated_at` - timestamp automático
- `unread_count_buyer` - padrão 0
- `unread_count_seller` - padrão 0

**Campos preenchidos depois**:
- `last_message` - atualizado ao enviar mensagem
- `last_message_time` - atualizado ao enviar mensagem

## Fluxo de Status do Chat (CRM)

```
novo → contatado → negociando → fechado
   └──────────────────────────────→ perdido
```

**Status possíveis**:
- `novo` - Lead novo, vendedor ainda não contatou
- `contatado` - Vendedor já entrou em contato
- `negociando` - Em processo de negociação ativa
- `fechado` - Venda concluída com sucesso ✅
- `perdido` - Negociação não prosperou ❌

## Validações Automáticas (Constraints)

### 1. Unique Chat per Announcement
```sql
CONSTRAINT unique_chat_per_announcement 
UNIQUE (announcement_id, buyer_id, seller_id)
```
**Impede**: Múltiplos chats entre o mesmo comprador e vendedor para o mesmo anúncio.

### 2. Buyer and Seller Must Be Different
```sql
CONSTRAINT buyer_seller_different 
CHECK (buyer_id != seller_id)
```
**Impede**: Usuário criar chat consigo mesmo.

## Fluxo Correto de Criação

```
1. Usuário clica em "Fale com o Vendedor"
   ↓
2. Verifica se já existe chat:
   SELECT id FROM chats
   WHERE announcement_id = X
   AND buyer_id = Y
   AND seller_id = Z
   ↓
3a. Se EXISTS: usa o chat_id existente
3b. Se NOT EXISTS: cria novo chat
   ↓
4. Cria lead vinculado ao chat
   ↓
5. Insere primeira mensagem
   ↓
6. Triggers automáticos:
   - Atualiza last_message no chat
   - Incrementa unread_count_seller
   - Cria notificação para vendedor
```

## Tipo TypeScript (types.ts)

O tipo `Chat` inclui `status`, mas esse campo vem do **anúncio**, não do chat:

```typescript
export interface Chat {
  id: string;
  adId: string;
  adTitle: string;
  adPrice: number;
  adImage: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  status: 'pending' | 'unlocked'; // <- Vem de announcements.status via VIEW
  createdAt: string;
}
```

**Nota**: O valor real virá do status do anúncio (`ACTIVE`, `PAUSED`, etc.), não de um status de chat.

## Teste de Validação

Para verificar se a correção funciona:

1. **Teste 1**: Criar novo chat com status 'novo'
   - Acessar um anúncio
   - Clicar em "Fale com o Vendedor"
   - Preencher formulário
   - Enviar mensagem
   - ✅ Deve criar chat com `status: 'novo'`
   - ✅ Badge "Lead Novo" deve aparecer para o vendedor

2. **Teste 2**: Chat duplicado
   - Tentar criar chat para o mesmo anúncio novamente
   - ✅ Deve usar o chat existente (não criar duplicado)

3. **Teste 3**: Próprio anúncio
   - Vendedor tenta contatar próprio anúncio
   - ✅ Deve mostrar: "Você não pode enviar mensagem para o seu próprio anúncio"

4. **Teste 4**: Verificar tipo TypeScript
   - VSCode deve aceitar apenas valores em português
   - ✅ `chat.status = 'novo'` → OK
   - ❌ `chat.status = 'new'` → Erro de tipo

## Logs de Debug

Para monitorar criação de chats, procure por:

```
[Chat] Criando novo chat...
[Chat] Chat criado com sucesso! ID: uuid, status: novo
[Lead] Criando lead...
[Lead] Lead criado com sucesso! ID: uuid
```

Em caso de erro:
```
[Chat] Erro ao criar chat: { code, message, details }
[Chat] Detalhes do erro: JSON completo
```

## Resumo da Solução

### Causa do Erro
O banco de dados foi configurado em **PORTUGUÊS**, mas o código tentava enviar valores em **INGLÊS**.

### Correção Aplicada
1. ✅ Adicionado `status: 'novo'` na criação de chats
2. ✅ Atualizado tipo `ChatStatus` para valores em português
3. ✅ Corrigido verificação de status em `MessageCard`
4. ✅ Adicionado tratamento robusto de erros
5. ✅ Criado script SQL para adicionar campo (se necessário)

### Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `components/ContactSellerModal.tsx` | Adicionado `status: 'novo'` |
| `components/ContactModal.tsx` | Adicionado `status: 'novo'` |
| `types.ts` | Criado `ChatStatus` em português |
| `components/MessageCard.tsx` | Verificação `status === 'novo'` |
| `sql/add_status_to_chats.sql` | Script para adicionar campo (**NOVO**) |

### Próximos Passos

**Execute no Supabase** (se o campo não existir):
```bash
sql/add_status_to_chats.sql
```

Esse script adiciona o campo `status` à tabela `chats` de forma segura, verificando se já existe.

---

**Data da Correção**: 5 de março de 2026  
**Versão**: 2.0 (Atualizado para valores em português)  
**Integração CRM**: Pronto para Nexus CRM filtrar por status
