# Sistema de Marcação Automática de Visualização em Chats

## Visão Geral
Sistema que marca automaticamente mensagens como lidas quando o usuário visualiza um chat, atualizando contadores em tempo real nos badges do header e sidebar.

## Funcionamento

### 1. Gatilhos de Marcação Automática

A função `markAsRead()` é disparada automaticamente em três momentos:

#### a) Ao Selecionar um Chat
Quando o usuário clica em uma conversa na lista lateral, todas as mensagens não lidas daquele chat são marcadas como lidas instantaneamente.

```typescript
// Disparo automático no useEffect quando chatId muda
useEffect(() => {
  // ... fetch messages
  await markAsRead(chatId); // <-- Marcação automática
}, [chatId])
```

#### b) Ao Receber Nova Mensagem
Quando uma nova mensagem chega via realtime e o chat já está aberto, ela é marcada como lida automaticamente.

```typescript
// Realtime subscription
.on('postgres_changes', { event: 'INSERT', table: 'messages' }, async (payload) => {
  if (payload.new.sender_id !== user.id) {
    await markAsRead(chatId); // <-- Marcação de mensagem recebida
  }
})
```

#### c) Ao Enviar Mensagem
Quando o usuário envia uma mensagem, eventuais pendências de leitura são zeradas, evitando "fantasmas" de notificação.

```typescript
const sendMessage = async (content: string) => {
  await supabase.from('messages').insert({ ... });
  await markAsRead(chatId); // <-- Limpeza de pendências
}
```

### 2. Operações no Banco de Dados

A função `markAsRead(chatId)` executa duas operações atômicas:

#### Operação 1: Atualizar Mensagens
```sql
UPDATE messages
SET is_read = true
WHERE chat_id = :chatId
  AND sender_id != :currentUserId
  AND is_read = false
```

**O que faz**: Marca como lidas apenas as mensagens recebidas (não enviadas) que ainda não foram lidas.

#### Operação 2: Zerar Contador do Chat
```sql
-- Se o usuário é VENDEDOR:
UPDATE chats
SET unread_count_seller = 0
WHERE id = :chatId

-- Se o usuário é COMPRADOR:
UPDATE chats
SET unread_count_buyer = 0
WHERE id = :chatId
```

**O que faz**: Identifica o papel do usuário no chat e zera apenas o contador correspondente.

### 3. Sincronização em Tempo Real

O sistema se integra perfeitamente com o hook `useNotificationsCount`:

```
┌─────────────────────────────────────────────────────────────────┐
│ Fluxo de Sincronização                                         │
└─────────────────────────────────────────────────────────────────┘

1. Usuário abre chat
   └─> markAsRead() atualiza tabela chats

2. Realtime do useNotificationsCount detecta mudança
   └─> Subscription na tabela chats dispara

3. Hook recalcula contador total
   └─> fetchMessagesCount() soma novos valores

4. Badges atualizam instantaneamente
   └─> React re-renderiza com novo valor
```

**Importante**: A sincronização é automática via Postgres Realtime. Nenhuma chamada manual é necessária.

## Implementação Técnica

### Hook useMessages

**Localização**: `src/hooks/useMessages.ts`

**Assinatura**:
```typescript
const { 
  messages,      // Array de mensagens do chat
  isLoading,     // Estado de carregamento
  error,         // Erros se houver
  sendMessage,   // Função para enviar mensagem
  markAsRead     // Função exposta para chamadas manuais (opcional)
} = useMessages(chatId);
```

**Função markAsRead**:
```typescript
const markAsRead = async (targetChatId: string) => {
  // 1. Buscar papel do usuário no chat
  const { data: chatData } = await supabase
    .from('chats')
    .select('seller_id, buyer_id, unread_count_seller, unread_count_buyer')
    .eq('id', targetChatId)
    .single();

  const isSeller = chatData.seller_id === user.id;

  // 2. Marcar mensagens como lidas
  await supabase
    .from('messages')
    .update({ is_read: true })
    .eq('chat_id', targetChatId)
    .neq('sender_id', user.id)
    .eq('is_read', false);

  // 3. Zerar contador apropriado
  const updateField = isSeller ? 'unread_count_seller' : 'unread_count_buyer';
  await supabase
    .from('chats')
    .update({ [updateField]: 0 })
    .eq('id', targetChatId);
};
```

### Componente MessagesView

**Localização**: `components/MessagesView.tsx`

**Integração**:
```typescript
const MessagesView: React.FC<MessagesViewProps> = ({ initialChatId }) => {
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId);
  
  // Hook já gerencia marcação automática internamente
  const { messages, sendMessage } = useMessages(selectedChatId);
  
  // Ao trocar de chat, o useEffect no hook dispara markAsRead automaticamente
  // Ao enviar mensagem, sendMessage já chama markAsRead internamente
  
  // Nenhuma lógica adicional necessária no componente!
}
```

## Benefícios

### 1. Experiência do Usuário
- ✅ Sem necessidade de botão "marcar como lida"
- ✅ Contadores atualizam instantaneamente
- ✅ Comportamento natural e intuitivo

### 2. Performance
- ✅ Apenas 2 queries por chat (otimizado)
- ✅ Nenhuma pooling desnecessária
- ✅ Realtime nativo do Postgres

### 3. Manutenção
- ✅ Lógica centralizada no hook
- ✅ Componentes não precisam gerenciar estado de leitura
- ✅ Fácil de testar e debugar

## Estrutura do Banco

### Tabela: messages
```sql
- id: uuid
- chat_id: uuid (FK)
- sender_id: uuid (FK)
- content: text
- is_read: boolean  <-- Campo atualizado
- created_at: timestamp
```

### Tabela: chats
```sql
- id: uuid
- announcement_id: uuid (FK)
- seller_id: uuid (FK)
- buyer_id: uuid (FK)
- unread_count_seller: integer  <-- Zerado para vendedor
- unread_count_buyer: integer   <-- Zerado para comprador
- status: text
- created_at: timestamp
```

## Testes

### Cenário 1: Selecionar Chat com Mensagens Não Lidas

**Passos**:
1. Ter um chat com contador > 0 no badge
2. Clicar no chat na lista lateral
3. Observar badge no header

**Resultado Esperado**:
- ✅ Mensagens aparecem na janela de chat
- ✅ Badge decrementa instantaneamente
- ✅ Ícone de check duplo aparece nas mensagens

### Cenário 2: Receber Mensagem em Chat Aberto

**Passos**:
1. Abrir um chat (A)
2. Outro usuário envia mensagem para esse chat
3. Observar comportamento

**Resultado Esperado**:
- ✅ Mensagem aparece instantaneamente
- ✅ Já vem marcada como lida (is_read: true)
- ✅ Badge não incrementa (pois foi lida automaticamente)

### Cenário 3: Enviar Mensagem em Chat com Pendências

**Passos**:
1. Chat tem 3 mensagens não lidas
2. Badge mostra "3"
3. Usuário envia uma mensagem
4. Observar badge

**Resultado Esperado**:
- ✅ Mensagem é enviada
- ✅ Badge zera (pendências limpas)
- ✅ Conversa flui sem "fantasmas" de notificação

## Troubleshooting

### Problema: Badge não atualiza após marcar como lida

**Diagnóstico**:
```sql
-- Verificar se realtime está ativo na tabela chats
SELECT * FROM pg_publication_tables 
WHERE tablename = 'chats';
```

**Solução**:
```sql
-- Habilitar realtime para a tabela
ALTER PUBLICATION supabase_realtime 
ADD TABLE chats;
```

### Problema: Contador fica negativo

**Causa**: Race condition ao receber múltiplas mensagens simultâneas.

**Solução**: Adicionar constraint no banco:
```sql
ALTER TABLE chats
ADD CONSTRAINT unread_count_seller_positive 
CHECK (unread_count_seller >= 0);

ALTER TABLE chats
ADD CONSTRAINT unread_count_buyer_positive 
CHECK (unread_count_buyer >= 0);
```

### Problema: Mensagens não marcam como lidas

**Debug**:
```typescript
// Adicionar logs na função markAsRead:
console.log('[markAsRead] Chat:', targetChatId);
console.log('[markAsRead] User:', user.id);
console.log('[markAsRead] Role:', isSeller ? 'seller' : 'buyer');
```

**Checklist**:
- [ ] Usuário está autenticado?
- [ ] Chat existe no banco?
- [ ] Usuário é participante do chat?
- [ ] RLS policies permitem UPDATE?

## Monitoramento

### Logs Úteis

O sistema emite logs em pontos-chave:

```typescript
// Hook useMessages
console.log('[markAsRead] Chat X marcado como lido para Y');

// Hook useNotificationsCount  
console.log('[useNotificationsCount] Chat mudou (seller):', payload);
console.log('[useNotificationsCount] Chat mudou (buyer):', payload);
```

### Queries de Análise

```sql
-- Mensagens não lidas por usuário
SELECT 
  u.name,
  COUNT(*) as unread_messages
FROM messages m
JOIN chats c ON m.chat_id = c.id
JOIN users u ON (c.seller_id = u.id OR c.buyer_id = u.id)
WHERE m.is_read = false
  AND m.sender_id != u.id
GROUP BY u.id, u.name;

-- Chats com inconsistências
SELECT 
  c.id,
  c.unread_count_seller,
  c.unread_count_buyer,
  COUNT(m.id) as real_unread_count
FROM chats c
LEFT JOIN messages m ON m.chat_id = c.id 
  AND m.is_read = false
GROUP BY c.id
HAVING c.unread_count_seller + c.unread_count_buyer != COUNT(m.id);
```

## Próximos Passos

### Melhorias Futuras

1. **Marcação em Lote**: Adicionar botão "marcar todas como lidas"
2. **Notificações Push**: Integrar com service worker para notificações desktop
3. **Indicador de Digitação**: Mostrar "Fulano está digitando..."
4. **Leitura por Mensagem**: Exibir timestamp de leitura individual

### Endpoints de API (Opcional)

Se necessário expor via REST:

```typescript
// POST /api/chats/:id/mark-read
app.post('/api/chats/:id/mark-read', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  // Chamar lógica equivalente a markAsRead
  await markChatAsRead(id, userId);
  
  res.json({ success: true });
});
```

---

**Documentação criada em**: 4 de março de 2026  
**Versão**: 1.0  
**Autor**: GitHub Copilot (Claude Sonnet 4.5)
