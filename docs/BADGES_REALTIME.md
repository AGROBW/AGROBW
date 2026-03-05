# 🔔 Sistema de Badges de Notificações e Mensagens - Realtime

## 📋 Visão Geral

Sistema completo de contadores realtime para badges de Mensagens e Notificações no Header da aplicação BWAGRO.

---

## 🎯 Funcionalidades

### 1. Badges Funcionais
- ✅ Contador de **Mensagens não lidas** (soma de `unread_count` da tabela `chats`)
- ✅ Contador de **Notificações não lidas** (count de `notifications` onde `is_read = false`)
- ✅ Badges aparecem apenas quando contador > 0 (interface limpa)
- ✅ Formato "9+" para contadores maiores que 9

### 2. Realtime Subscriptions
- ✅ Atualização instantânea quando novo chat é criado ou atualizado
- ✅ Atualização instantânea quando nova notificação é inserida
- ✅ Atualização quando notificações são marcadas como lidas
- ✅ Logs no console para debugging

### 3. Performance Otimizada
- ✅ Hook centralizado (`useNotificationsCount`) independente
- ✅ Queries otimizadas (apenas contadores, não busca dados completos)
- ✅ Subscriptions separadas para cada tabela
- ✅ Cleanup automático de subscriptions

---

## 🔧 Implementação

### Estrutura de Arquivos

```
src/
├── hooks/
│   └── useNotificationsCount.ts    ← Hook centralizado (NOVO)
└── components/
    └── Header.tsx                  ← Atualizado para usar o novo hook
```

---

## 📦 Hook: useNotificationsCount

**Localização**: `src/hooks/useNotificationsCount.ts`

### Interface

```typescript
interface NotificationCounts {
  messagesCount: number         // Total de mensagens não lidas
  notificationsCount: number    // Total de notificações não lidas
  isLoading: boolean           // Estado de carregamento inicial
}
```

### Uso

```typescript
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';

const { messagesCount, notificationsCount, isLoading } = useNotificationsCount();
```

---

## 🔄 Como Funciona

### 1. Contador de Mensagens

#### Query Inicial
```sql
SELECT unread_count_seller, unread_count_buyer, seller_id, buyer_id
FROM chats
WHERE seller_id = auth.uid() OR buyer_id = auth.uid()
```

**Lógica**:
- Se usuário é `seller`: soma `unread_count_seller`
- Se usuário é `buyer`: soma `unread_count_buyer`
- Total = soma de todos os chats do usuário

#### Realtime Subscription
```typescript
supabase
  .channel('chats_count_changes')
  .on('postgres_changes', {
    event: '*', // INSERT, UPDATE, DELETE
    schema: 'public',
    table: 'chats',
    filter: `seller_id=eq.${user.id}` // ou buyer_id
  })
  .subscribe()
```

**Eventos que atualizam o badge**:
- ✅ Novo chat criado
- ✅ Mensagem enviada (incrementa unread_count)
- ✅ Mensagem lida (decrementa unread_count)
- ✅ Chat deletado

---

### 2. Contador de Notificações

#### Query Inicial
```sql
SELECT COUNT(*)
FROM notifications
WHERE user_id = auth.uid() AND is_read = false
```

**Resultado**: Número total de notificações não lidas

#### Realtime Subscription
```typescript
supabase
  .channel('notifications_count_changes')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'notifications',
    filter: `user_id=eq.${user.id}`
  })
  .subscribe()
```

**Eventos que atualizam o badge**:
- ✅ Nova notificação inserida (incrementa imediatamente)
- ✅ Notificação marcada como lida (refetch para precisão)
- ✅ Notificação deletada (refetch)

---

## 🎨 Interface (UI)

### Desktop

**Mensagens** (linha 59-69 do Header.tsx):
```tsx
<Link to="/mensagens" className="relative p-2 ...">
  <MessageCircle className="w-5 h-5" />
  {messagesCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-green-700 ...">
      {messagesCount > 9 ? '9+' : messagesCount}
    </span>
  )}
</Link>
```

**Notificações** (linha 71-81 do Header.tsx):
```tsx
<Link to="/notificacoes" className="relative p-2 ...">
  <Bell className="w-5 h-5" />
  {notificationsCount > 0 && (
    <span className="absolute -top-1 -right-1 bg-green-700 ...">
      {notificationsCount > 9 ? '9+' : notificationsCount}
    </span>
  )}
</Link>
```

### Mobile

**Mensagens** (linha 154-167 do Header.tsx):
```tsx
<Link to="/mensagens" className="flex items-center justify-between ...">
  <div>
    <MessageCircle />
    <span>Mensagens</span>
  </div>
  {messagesCount > 0 && (
    <span className="bg-green-700 ...">
      {messagesCount}
    </span>
  )}
</Link>
```

---

## 🧪 Como Testar

### Teste 1: Mensagens não lidas

1. **Criar novo chat**:
   ```typescript
   // Abrir console do navegador
   console.log('Antes:', messagesCount)
   
   // Enviar mensagem via outra conta
   // Badge deve atualizar automaticamente
   console.log('Depois:', messagesCount)
   ```

2. **Verificar badge**:
   - ✅ Badge aparece quando messagesCount > 0
   - ✅ Badge oculta quando messagesCount = 0
   - ✅ Formato "9+" para números maiores que 9

3. **Marcar como lida**:
   - Abrir a conversa
   - Badge deve decrementar automaticamente

---

### Teste 2: Notificações não lidas

1. **Criar nova notificação** (via SQL ou trigger):
   ```sql
   INSERT INTO notifications (user_id, type, title, content, is_read)
   VALUES ('SEU-USER-ID', 'NEW_LEAD', 'Novo Lead', 'Você recebeu um novo lead', false);
   ```

2. **Verificar badge**:
   - ✅ Badge deve incrementar IMEDIATAMENTE (sem reload)
   - ✅ Console deve mostrar: `[useNotificationsCount] Nova notificação inserida`

3. **Marcar como lida**:
   ```sql
   UPDATE notifications
   SET is_read = true
   WHERE id = 'NOTIFICATION-ID';
   ```
   - ✅ Badge deve decrementar automaticamente

---

### Teste 3: Realtime Subscription

1. **Verificar subscriptions ativas**:
   ```javascript
   // Abrir console do navegador
   supabase.getChannels()
   // Deve mostrar: 'chats_count_changes', 'notifications_count_changes'
   ```

2. **Simular evento realtime**:
   - Abrir duas abas do navegador
   - Enviar mensagem em uma aba
   - Badge na outra aba deve atualizar SEM reload

---

### Teste 4: Performance

1. **Verificar logs**:
   ```
   [useNotificationsCount] Chat mudou (seller): {...}
   [useNotificationsCount] Nova notificação inserida: {...}
   ```

2. **Verificar queries** (Network tab):
   - ✅ Query inicial: `GET /rest/v1/chats?select=unread_count_seller...`
   - ✅ Query inicial: `GET /rest/v1/notifications?select=*&count=exact&head=true`
   - ✅ Nenhuma query adicional após subscrições estarem ativas

---

## 🔧 Estrutura do Banco de Dados

### Tabela: chats

```sql
CREATE TABLE chats (
  id UUID PRIMARY KEY,
  announcement_id UUID REFERENCES announcements(id),
  seller_id UUID REFERENCES users(id),
  buyer_id UUID REFERENCES users(id),
  unread_count_seller INTEGER DEFAULT 0,  -- ← Contador para o vendedor
  unread_count_buyer INTEGER DEFAULT 0,   -- ← Contador para o comprador
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Importante**: 
- `unread_count_seller`: Mensagens não lidas pelo VENDEDOR
- `unread_count_buyer`: Mensagens não lidas pelo COMPRADOR

---

### Tabela: notifications

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  is_read BOOLEAN DEFAULT false,  -- ← Flag de leitura
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para performance
CREATE INDEX idx_notifications_user_unread 
ON notifications(user_id, is_read) 
WHERE is_read = false;
```

---

## 🐛 Troubleshooting

### Problema 1: Badge não atualiza

**Sintoma**: Badge não incrementa quando nova mensagem chega

**Causas possíveis**:
1. Realtime não está habilitado no Supabase
2. RLS está bloqueando subscriptions
3. Usuário não está autenticado

**Solução**:
```sql
-- 1. Verificar Realtime no Supabase Dashboard > Database > Replication
-- Certifique-se de que 'chats' e 'notifications' estão habilitadas

-- 2. Verificar RLS
SELECT * FROM pg_policies WHERE tablename IN ('chats', 'notifications');

-- 3. Verificar autenticação
SELECT auth.uid(); -- Deve retornar o ID do usuário logado
```

---

### Problema 2: Contador incorreto

**Sintoma**: Badge mostra número diferente do real

**Causas possíveis**:
1. Colunas `unread_count_seller` / `unread_count_buyer` desatualizadas
2. Mensagens antigas sem contador

**Solução**:
```sql
-- Recalcular contadores de chats
UPDATE chats c
SET 
  unread_count_seller = (
    SELECT COUNT(*)
    FROM messages m
    WHERE m.chat_id = c.id 
      AND m.is_read = false 
      AND m.sender_id = c.buyer_id
  ),
  unread_count_buyer = (
    SELECT COUNT(*)
    FROM messages m
    WHERE m.chat_id = c.id 
      AND m.is_read = false 
      AND m.sender_id = c.seller_id
  );

-- Resultado esperado: Badges devem refletir números corretos
```

---

### Problema 3: Logs não aparecem

**Sintoma**: Nenhum log de realtime no console

**Solução**:
```typescript
// Verificar se subscriptions estão ativas
import { supabase } from '../lib/supabaseClient';

const channels = supabase.getChannels();
console.log('Canais ativos:', channels);

// Deve mostrar:
// ['chats_count_changes', 'notifications_count_changes']
```

---

### Problema 4: Badge não oculta quando zero

**Sintoma**: Badge continua visível com "0"

**Solução**:
Verificar no Header.tsx se a condição está correta:

```tsx
{messagesCount > 0 && (  // ← Deve ser > 0, não >= 0
  <span>...</span>
)}
```

---

## 📊 Monitoramento

### Dashboard de Contadores

Execute no Supabase SQL Editor:

```sql
-- Ver contadores de todos os usuários
SELECT 
  u.id,
  u.name,
  
  -- Mensagens não lidas
  (SELECT SUM(
    CASE 
      WHEN c.seller_id = u.id THEN c.unread_count_seller
      WHEN c.buyer_id = u.id THEN c.unread_count_buyer
      ELSE 0
    END
  ) FROM chats c WHERE c.seller_id = u.id OR c.buyer_id = u.id) as total_mensagens_nao_lidas,
  
  -- Notificações não lidas
  (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.is_read = false) as total_notificacoes_nao_lidas

FROM users u
WHERE u.id IN (
  SELECT DISTINCT seller_id FROM chats
  UNION
  SELECT DISTINCT buyer_id FROM chats
)
ORDER BY total_mensagens_nao_lidas DESC, total_notificacoes_nao_lidas DESC
LIMIT 20;
```

**Resultado esperado**:
```
id        | name       | total_mensagens_nao_lidas | total_notificacoes_nao_lidas
----------+------------+---------------------------+-----------------------------
abc-123   | João Silva | 15                        | 3
def-456   | Maria      | 8                         | 0
```

---

## 🚀 Melhorias Futuras

### 1. Cache Local
```typescript
// Usar localStorage para persistir contadores
localStorage.setItem('messagesCount', messagesCount.toString());
```

### 2. Debounce
```typescript
// Evitar múltiplas atualizações rápidas
const debouncedFetch = useCallback(
  debounce(() => fetchMessagesCount(), 500),
  []
);
```

### 3. Badge Customizável
```typescript
// Permitir cores diferentes por tipo
<Badge color={type === 'message' ? 'green' : 'blue'} />
```

### 4. Notificações Push
```typescript
// Integrar com Web Push API
if ('Notification' in window) {
  Notification.requestPermission();
}
```

---

## ✅ Checklist de Implementação

- [x] Hook `useNotificationsCount` criado
- [x] Query de mensagens implementada (soma de unread_count)
- [x] Query de notificações implementada (count where is_read = false)
- [x] Realtime para chats configurado
- [x] Realtime para notifications configurado
- [x] Badges no Header (desktop) vinculados
- [x] Badges no Header (mobile) vinculados
- [x] Badges ocultos quando contador = 0
- [x] Formato "9+" para números > 9
- [x] Logs de debugging implementados

---

## 📚 Referências

- [Documentação Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [React Hooks Best Practices](https://react.dev/reference/react)
- [PostgreSQL Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)

---

**Desenvolvido em**: Março 2026  
**Status**: ✅ Completo e Funcional  
**Manutenção**: Monitorar logs do console para debugar subscriptions
