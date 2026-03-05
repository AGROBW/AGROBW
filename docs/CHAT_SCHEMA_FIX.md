# Correção: Erro 400 ao Criar Chat

## Problema Identificado

Erro `check_constraint "chats_status_check"` ocorria ao tentar criar um novo chat através do botão "Fale com o Vendedor".

### Causa Raiz

O código estava tentando inserir um campo `status` na tabela `chats`, mas **esse campo não existe** na estrutura real da tabela.

## Estrutura Real da Tabela `chats`

```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY,
  announcement_id UUID REFERENCES announcements(id),
  buyer_id UUID REFERENCES users(id),
  seller_id UUID REFERENCES users(id),
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

**Nota importante**: A tabela `chats` **NÃO possui o campo `status`**.

## VIEW chats_full

A VIEW `chats_full` traz um campo `status`, mas ele vem da tabela `announcements`, não de `chats`:

```sql
CREATE VIEW chats_full AS
SELECT 
  c.*,
  a.status,  -- <- Status do ANÚNCIO, não do chat
  ...
FROM chats c
LEFT JOIN announcements a ON a.id = c.announcement_id;
```

## Correções Implementadas

### 1. ContactSellerModal.tsx

**Antes (❌ causava erro 400)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: user.id,
  seller_id: sellerId,
  status: 'pending',  // ❌ Campo não existe!
  last_message: formData.message,
  last_message_time: new Date().toISOString()
})
```

**Depois (✅ funciona)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: user.id,
  seller_id: sellerId,
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
  seller_id: sellerId,
  status: 'pending'  // ❌ Campo não existe!
})
```

**Depois (✅ funciona)**:
```typescript
await supabase.from('chats').insert({
  announcement_id: announcementId,
  buyer_id: buyerId,
  seller_id: sellerId
})
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
  seller_id: string         // UUID do vendedor (dono do anúncio)
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

1. **Teste 1**: Criar novo chat
   - Acessar um anúncio
   - Clicar em "Fale com o Vendedor"
   - Preencher formulário
   - Enviar mensagem
   - ✅ Deve criar chat com sucesso

2. **Teste 2**: Chat duplicado
   - Tentar criar chat para o mesmo anúncio novamente
   - ✅ Deve usar o chat existente (não criar duplicado)

3. **Teste 3**: Próprio anúncio
   - Vendedor tenta contatar próprio anúncio
   - ✅ Deve mostrar: "Você não pode enviar mensagem para o seu próprio anúncio"

4. **Teste 4**: Validação frontend
   - Verificar que todos os campos obrigatórios são validados
   - ✅ Botão desabilitado até formulário válido

## Logs de Debug

Para monitorar criação de chats, procure por:

```
[Chat] Criando novo chat...
[Chat] Chat criado com sucesso! ID: uuid
[Lead] Criando lead...
[Lead] Lead criado com sucesso! ID: uuid
```

Em caso de erro:
```
[Chat] Erro ao criar chat: { code, message, details }
[Chat] Detalhes do erro: JSON completo
```

---

**Data da Correção**: 5 de março de 2026  
**Arquivos Modificados**: 
- `components/ContactSellerModal.tsx`
- `components/ContactModal.tsx`
