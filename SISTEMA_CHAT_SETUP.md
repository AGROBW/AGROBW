# Sistema de Chat, Leads e Notificações - BWAGRO

## 📋 Instruções de Configuração do Banco de Dados

Este documento contém as instruções para configurar o sistema completo de chat, leads e notificações no Supabase.

### 🔧 Ordem de Execução dos Scripts SQL

Execute os scripts SQL na seguinte ordem no **SQL Editor** do Supabase:

#### 1. Criar Tabelas e RLS
```bash
sql/create_chat_tables.sql
```

Este script cria:
- ✅ Tabela `chats` - conversas entre compradores e vendedores
- ✅ Tabela `messages` - mensagens dentro dos chats
- ✅ Tabela `leads` - leads gerados a partir dos contatos
- ✅ Tabela `notifications` - notificações para usuários
- ✅ Índices otimizados para performance
- ✅ Políticas RLS (Row Level Security) para segurança

**Características de Segurança:**
- ✅ Isolamento total: usuários só veem seus próprios chats/mensagens
- ✅ Restrição no INSERT: `buyer_id` deve ser `auth.uid()` (impede falsificação)
- ✅ Constraint único: previne múltiplos chats para o mesmo anúncio entre as mesmas pessoas
- ✅ Validação: mensagens não podem ser vazias

#### 2. Criar Triggers e Funções
```bash
sql/create_chat_triggers.sql
```

Este script cria:
- ✅ Função `update_chat_last_message()` - atualiza última mensagem e contadores
- ✅ Trigger para incrementar `unread_count` automaticamente
- ✅ Função `create_message_notification()` - notifica destinatário de novas mensagens
- ✅ Função `create_lead_notification()` - notifica vendedor de novos leads
- ✅ Função `reset_unread_count()` - decrementa contador ao marcar como lida
- ✅ Triggers `updated_at` automáticos

**Automações Implementadas:**
1. Toda mensagem nova → Atualiza `last_message` e `last_message_time` no chat
2. Toda mensagem nova → Incrementa `unread_count` do destinatário
3. Toda mensagem nova → Cria notificação para o destinatário
4. Todo lead novo → Cria notificação para o vendedor
5. Mensagem marcada como lida → Decrementa `unread_count`

---

## 🚀 Funcionalidades Implementadas

### 1. Modal de Contato "Fale com o Vendedor"
**Arquivo:** `components/ContactModal.tsx`

✅ Formulário completo com:
- Nome, E-mail, Telefone (com máscara), CEP (com máscara)
- Textarea para mensagem
- Checkbox obrigatório de Termos e Privacidade

✅ Autopreenchimento:
- Se usuário logado → busca dados da tabela `users`
- Campos preenchidos ficam `readOnly` (garante veracidade do lead)

✅ Validações:
- Telefone mínimo 10 dígitos
- Todos os campos obrigatórios
- Botão desabilitado até formulário válido

### 2. Página de Detalhe do Anúncio
**Arquivo:** `pages/AdDetailView.tsx`

✅ Verificação de autenticação:
- Não logado → Toast: "Para negociar, você precisa estar logado"
- Não pode contatar próprio anúncio

✅ Botões:
- ❌ **Removido:** "Fazer uma Proposta"
- ✅ **Principal:** "Fale com o Vendedor" (abre modal)
- ✅ **Secundário:** "WhatsApp Direto" (se vendedor tiver)

### 3. Fluxo de Criação de Chat e Lead
**Arquivo:** `components/ContactModal.tsx` - função `handleSubmit()`

```typescript
1. Verificar se chat já existe entre buyer e seller para este anúncio
   ↓
2. Se NÃO existe:
   - Criar novo chat na tabela `chats`
   - Criar lead na tabela `leads` vinculado ao chat
   ↓
3. Inserir mensagem na tabela `messages`
   ↓
4. Triggers automáticos:
   - Atualiza `last_message` no chat
   - Incrementa `unread_count_seller`
   - Cria notificação para vendedor
```

### 4. Segurança de Dados (RLS)

#### Tabela `chats`:
```sql
-- Usuário só vê chats onde é buyer OU seller
SELECT: auth.uid() = buyer_id OR auth.uid() = seller_id

-- Só comprador pode criar chat
INSERT: auth.uid() = buyer_id

-- Participantes podem atualizar (ex: marcar como lido)
UPDATE: auth.uid() = buyer_id OR auth.uid() = seller_id
```

#### Tabela `messages`:
```sql
-- Usuário só vê mensagens de seus chats
SELECT: EXISTS (
  SELECT 1 FROM chats
  WHERE chats.id = messages.chat_id
  AND (chats.buyer_id = auth.uid() OR chats.seller_id = auth.uid())
)

-- Só pode enviar mensagem se for participante
INSERT: auth.uid() = sender_id AND participa_do_chat
```

#### Tabela `leads`:
```sql
-- Apenas vendedor E comprador veem o lead
SELECT: auth.uid() = buyer_id OR auth.uid() = seller_id

-- Comprador cria o lead
INSERT: auth.uid() = buyer_id

-- Vendedor pode atualizar status
UPDATE: auth.uid() = seller_id
```

#### Tabela `notifications`:
```sql
-- Usuário só vê suas notificações
SELECT: auth.uid() = user_id

-- Usuário só pode marcar suas notificações como lidas
UPDATE: auth.uid() = user_id
```

---

## 📊 Estrutura de Dados

### Tabela: `chats`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Primary Key |
| `announcement_id` | UUID | Referência ao anúncio |
| `buyer_id` | UUID | ID do comprador |
| `seller_id` | UUID | ID do vendedor |
| `last_message` | TEXT | Última mensagem enviada |
| `last_message_time` | TIMESTAMPTZ | Hora da última mensagem |
| `unread_count_buyer` | INTEGER | Contador de não lidas (buyer) |
| `unread_count_seller` | INTEGER | Contador de não lidas (seller) |
| `created_at` | TIMESTAMPTZ | Data de criação |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**Constraints:**
- ✅ UNIQUE (`announcement_id`, `buyer_id`, `seller_id`)
- ✅ CHECK (`buyer_id != seller_id`)

### Tabela: `messages`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Primary Key |
| `chat_id` | UUID | Referência ao chat |
| `sender_id` | UUID | Quem enviou |
| `content` | TEXT | Conteúdo da mensagem |
| `is_read` | BOOLEAN | Se foi lida |
| `created_at` | TIMESTAMPTZ | Data de envio |

**Constraints:**
- ✅ CHECK (`trim(content) != ''`)

### Tabela: `leads`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Primary Key |
| `chat_id` | UUID | Referência ao chat |
| `announcement_id` | UUID | Referência ao anúncio |
| `buyer_id` | UUID | ID do comprador |
| `seller_id` | UUID | ID do vendedor |
| `buyer_name` | TEXT | Nome do comprador |
| `buyer_email` | TEXT | Email do comprador |
| `buyer_phone` | TEXT | Telefone do comprador |
| `buyer_cep` | TEXT | CEP do comprador |
| `initial_message` | TEXT | Mensagem inicial |
| `status` | TEXT | Status do lead |
| `created_at` | TIMESTAMPTZ | Data de criação |

**Status possíveis:**
- `new` - Novo lead
- `contacted` - Vendedor já entrou em contato
- `negotiating` - Em negociação
- `closed` - Fechado (venda realizada)
- `lost` - Perdido (não deu certo)

### Tabela: `notifications`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | Primary Key |
| `user_id` | UUID | Usuário destinatário |
| `type` | TEXT | Tipo da notificação |
| `title` | TEXT | Título |
| `message` | TEXT | Mensagem |
| `link` | TEXT | Link relacionado |
| `is_read` | BOOLEAN | Se foi lida |
| `created_at` | TIMESTAMPTZ | Data de criação |

**Tipos possíveis:**
- `new_message` - Nova mensagem recebida
- `new_lead` - Novo lead gerado
- `system` - Notificação do sistema

---

## 🔔 Sistema de Notificações

### Gatilhos Automáticos:

1. **Nova Mensagem Enviada**
   ```
   Trigger: trigger_create_message_notification
   Ação: Cria notificação para o DESTINATÁRIO
   Título: "Nova mensagem de [Nome]"
   Link: /minha-conta/mensagens?chat={chat_id}
   ```

2. **Novo Lead Criado**
   ```
   Trigger: trigger_create_lead_notification
   Ação: Cria notificação para o VENDEDOR
   Título: "Novo interesse no seu anúncio"
   Mensagem: "[Nome] está interessado em: [Título do Anúncio]"
   Link: /minha-conta/leads?lead={lead_id}
   ```

### Integração Futura - SMTP & WhatsApp

**Preparado para:**
- ✅ Envio de e-mail via SMTP (campo `buyer_email` no lead)
- ✅ Envio de WhatsApp (campo `buyer_phone` no lead)
- ✅ Hook de integração comentado em `ContactModal.tsx` linha 150-155

**Sugestão de implementação:**
```typescript
// Após criar lead com sucesso, chamar API externa:
// TODO: Integrar com serviço de e-mail
// await sendEmailNotification(seller.email, leadData);

// TODO: Integrar com API de WhatsApp
// await sendWhatsAppNotification(seller.phone, leadData);
```

---

## ✅ Checklist de Configuração

- [ ] 1. Executar `sql/create_chat_tables.sql` no Supabase SQL Editor
- [ ] 2. Executar `sql/create_chat_triggers.sql` no Supabase SQL Editor
- [ ] 3. Verificar se tabelas foram criadas: `chats`, `messages`, `leads`, `notifications`
- [ ] 4. Verificar RLS habilitado: todas as tabelas devem ter RLS `enabled`
- [ ] 5. Testar permissões: tentar inserir/ler dados com diferentes usuários
- [ ] 6. Verificar índices criados: `idx_chats_buyer`, `idx_messages_chat`, etc.
- [ ] 7. Testar triggers: inserir mensagem e verificar atualização automática do chat
- [ ] 8. Testar notificações: criar lead e verificar notificação gerada
- [ ] 9. Instalar dependências frontend: `npm install react-input-mask @types/react-input-mask`
- [ ] 10. Testar modal de contato na página de detalhes do anúncio

---

## 🐛 Troubleshooting

### Erro: "Permissão negada ao inserir chat"
**Causa:** RLS impedindo inserção com `buyer_id` diferente de `auth.uid()`
**Solução:** Verificar se usuário está autenticado corretamente

### Erro: "Constraint unique_chat_per_announcement violated"
**Causa:** Chat já existe para este anúncio entre buyer e seller
**Solução:** Função `handleSubmit()` já trata isso - verifica antes de inserir

### Erro: "Cannot read property 'id' of undefined"
**Causa:** Usuário não logado tentando abrir modal
**Solução:** Função `handleContactClick()` já valida e mostra toast

### Notificações não aparecem
**Causa:** Triggers não configurados corretamente
**Solução:** Re-executar `sql/create_chat_triggers.sql`

---

## 📝 Notas Técnicas

1. **Performance:** Todos os índices necessários foram criados para queries rápidas
2. **Segurança:** RLS garante isolamento total entre usuários
3. **Integridade:** Constraints previnem dados inconsistentes
4. **Auditoria:** `created_at` e `updated_at` em todas as tabelas
5. **Escalabilidade:** Estrutura preparada para milhares de chats simultâneos

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs do console do navegador
2. Verifique logs do Supabase (SQL Editor > Logs)
3. Confirme execução de todos os scripts SQL
4. Valide permissões RLS no Supabase Dashboard

---

**Data de implementação:** 10 de fevereiro de 2026
**Versão:** 1.0.0
