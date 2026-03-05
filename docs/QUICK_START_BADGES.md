# ⚡ Guia Rápido: Badges Realtime

## 🎯 O que foi implementado?

✅ **Hook centralizado** `useNotificationsCount` para gerenciar contadores  
✅ **Contador de Mensagens** (soma de `unread_count` da tabela `chats`)  
✅ **Contador de Notificações** (count de `notifications` onde `is_read = false`)  
✅ **Realtime Subscriptions** para atualização instantânea  
✅ **Badges funcionais** no Header (desktop e mobile)  
✅ **Badges ocultos** quando contador = 0 (interface limpa)

---

## 🚀 Como usar?

### No Header (já implementado)

```typescript
import { useNotificationsCount } from '../src/hooks/useNotificationsCount';

const { messagesCount, notificationsCount, isLoading } = useNotificationsCount();

// Badges aparecem automaticamente quando > 0
{messagesCount > 0 && <Badge>{messagesCount}</Badge>}
{notificationsCount > 0 && <Badge>{notificationsCount}</Badge>}
```

---

## 🧪 Testes Rápidos

### Teste 1: Mensagens (30 segundos)

1. **Abrir console do navegador** (F12)
2. **Ver contador inicial**:
   ```javascript
   // Deve mostrar logs:
   [useNotificationsCount] Fetching messages count...
   ```
3. **Simular nova mensagem** (via SQL ou outra conta):
   ```sql
   -- Atualizar unread_count de um chat
   UPDATE chats
   SET unread_count_buyer = unread_count_buyer + 1
   WHERE id = 'SEU-CHAT-ID';
   ```
4. **Verificar badge**: Deve incrementar AUTOMATICAMENTE (sem reload) ✅

---

### Teste 2: Notificações (30 segundos)

1. **Console aberto** (F12)
2. **Inserir notificação**:
   ```sql
   INSERT INTO notifications (user_id, type, title, content, is_read)
   VALUES (
     'SEU-USER-ID',
     'NEW_LEAD',
     'Novo Lead Recebido',
     'Você tem um novo interessado',
     false
   );
   ```
3. **Ver log no console**:
   ```
   [useNotificationsCount] Nova notificação inserida: {...}
   ```
4. **Verificar badge**: Deve incrementar IMEDIATAMENTE ✅

---

### Teste 3: Atualização Realtime (1 minuto)

1. **Abrir duas abas** do navegador na mesma página
2. **Na Aba 1**: Ver badges
3. **Na Aba 2**: Enviar mensagem ou criar notificação
4. **Na Aba 1**: Badge atualiza SEM refresh ✅

---

## 🔧 Estrutura do Banco

### Tabela: chats

```sql
-- Colunas importantes:
unread_count_seller INTEGER DEFAULT 0  -- Contador para vendedor
unread_count_buyer INTEGER DEFAULT 0   -- Contador para comprador
```

**Como funciona**:
- Quando VENDEDOR está logado → soma `unread_count_seller`
- Quando COMPRADOR está logado → soma `unread_count_buyer`
- Total = soma de todos os chats do usuário

---

### Tabela: notifications

```sql
-- Colunas importantes:
user_id UUID          -- Dono da notificação
is_read BOOLEAN       -- false = não lida
```

**Query**:
```sql
SELECT COUNT(*)
FROM notifications
WHERE user_id = auth.uid() AND is_read = false
```

---

## 🐛 Troubleshooting Rápido

### Badge não atualiza?

**1. Verificar Realtime no Supabase**:
- Dashboard > Settings > Database > Replication
- Certifique-se que `chats` e `notifications` estão habilitadas

**2. Verificar console**:
```javascript
// Deve mostrar logs:
[useNotificationsCount] Chat mudou (seller): {...}
[useNotificationsCount] Nova notificação inserida: {...}
```

**3. Verificar subscriptions**:
```javascript
supabase.getChannels()
// Deve retornar: ['chats_count_changes', 'notifications_count_changes']
```

---

### Contador incorreto?

**Recalcular contadores**:
```sql
-- Para chats
UPDATE chats c
SET 
  unread_count_seller = (
    SELECT COUNT(*) FROM messages m
    WHERE m.chat_id = c.id AND m.is_read = false AND m.sender_id = c.buyer_id
  ),
  unread_count_buyer = (
    SELECT COUNT(*) FROM messages m
    WHERE m.chat_id = c.id AND m.is_read = false AND m.sender_id = c.seller_id
  );
```

---

### Badge não oculta quando zero?

**Verificar condição no código**:
```tsx
{messagesCount > 0 && (  // ← Deve ser > 0, não >= 0
  <span className="badge">...</span>
)}
```

---

## 📊 Monitoramento

### Ver contadores de todos os usuários

```sql
SELECT 
  u.name,
  (SELECT SUM(
    CASE WHEN c.seller_id = u.id THEN c.unread_count_seller
         WHEN c.buyer_id = u.id THEN c.unread_count_buyer
         ELSE 0 END
  ) FROM chats c WHERE c.seller_id = u.id OR c.buyer_id = u.id) as mensagens,
  (SELECT COUNT(*) FROM notifications n WHERE n.user_id = u.id AND n.is_read = false) as notificacoes
FROM users u
LIMIT 10;
```

---

## 📁 Arquivos Criados/Modificados

### Novos Arquivos
- ✅ `src/hooks/useNotificationsCount.ts` (Hook centralizado)
- ✅ `docs/BADGES_REALTIME.md` (Documentação completa)
- ✅ `docs/QUICK_START_BADGES.md` (Este guia)

### Arquivos Modificados
- ✅ `components/Header.tsx` (Integração do hook)

---

## ✅ Checklist Final

- [x] Hook criado e funcionando
- [x] Queries otimizadas implementadas
- [x] Realtime subscriptions configuradas
- [x] Badges no desktop funcionando
- [x] Badges no mobile funcionando
- [x] Badges ocultos quando zero
- [x] Formato "9+" para números > 9
- [x] Logs de debugging implementados
- [x] Documentação completa criada

---

## 🎉 Resultado Final

**Antes** ❌:
- Badges sempre visíveis (mesmo com 0)
- Atualização apenas ao recarregar página
- Cálculo manual em cada componente

**Depois** ✅:
- Badges aparecem apenas quando necessário
- Atualização instantânea (realtime)
- Hook centralizado e otimizado
- Performance melhorada

---

## 📚 Documentação Completa

Para detalhes técnicos, troubleshooting avançado e exemplos:
- 👉 [BADGES_REALTIME.md](./BADGES_REALTIME.md)

---

**Status**: ✅ Pronto para produção  
**Tempo de implementação**: 30 minutos  
**Complexidade**: Média  
**Manutenção**: Baixa (automático)
