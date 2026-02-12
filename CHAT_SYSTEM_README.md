# Sistema de Chat e Contato - Instruções de Instalação

## 📋 Pré-requisitos
- Acesso ao Supabase SQL Editor
- Tabelas `users` e `announcements` já criadas

## 🚀 Passo a Passo

### 1. Verificar Estado Atual
Execute no **Supabase SQL Editor**:
```sql
-- Cole o conteúdo de: sql/verify_chat_system.sql
```

Se todas as tabelas retornarem `existe = true`, o sistema já está instalado. ✅

### 2. Criar Tabelas (se necessário)
Se alguma tabela não existir, execute na ordem:

```sql
-- 1º: Criar tabelas, índices e RLS
-- Cole o conteúdo de: sql/create_chat_tables.sql
```

### 3. Criar Triggers e Automações
```sql
-- 2º: Criar funções e triggers
-- Cole o conteúdo de: sql/create_chat_triggers.sql
```

### 4. Criar VIEW Consolidada
```sql
-- 3º: Criar view para facilitar consultas
-- Cole o conteúdo de: sql/create_chats_view.sql
```

### 5. Verificar Instalação
Execute novamente o script de verificação para confirmar:
```sql
-- Cole o conteúdo de: sql/verify_chat_system.sql
```

## ✅ Funcionalidades Implementadas

### Frontend
- ✅ Modal de contato "Fale com o Vendedor"
- ✅ Autopreenchimento de dados do usuário logado
- ✅ Máscaras para telefone e CEP (react-input-mask)
- ✅ Validação de formulário
- ✅ Checkbox obrigatório de termos
- ✅ Verificação de autenticação
- ✅ Proteção contra auto-mensagem

### Backend (Supabase)
- ✅ Tabela `chats` com índice único composto
- ✅ Tabela `messages` com constraint de conteúdo não vazio
- ✅ Tabela `leads` para armazenar contatos
- ✅ Tabela `notifications` para alertas
- ✅ RLS (Row Level Security) completo
- ✅ Trigger para atualizar última mensagem
- ✅ Trigger para incrementar contador de não lidas
- ✅ Trigger para criar notificações automáticas
- ✅ Constraint `buyer_id != seller_id`

### Segurança
- ✅ RLS habilitado em todas as tabelas
- ✅ `buyer_id` capturado via `auth.uid()`
- ✅ Políticas de leitura apenas para participantes
- ✅ Policies para INSERT/UPDATE com verificações
- ✅ Campos readonly para dados pré-preenchidos

## 🔄 Fluxo de Funcionamento

1. Usuário clica em **"Fale com o Vendedor"**
2. Sistema verifica se está logado
3. Modal abre com dados pré-preenchidos
4. Usuário escreve mensagem e aceita termos
5. Backend verifica se já existe chat entre comprador/vendedor
6. Se não existe:
   - Cria registro em `chats`
   - Cria registro em `leads`
7. Insere mensagem em `messages`
8. Triggers automáticos:
   - Atualizam `last_message` e `last_message_time`
   - Incrementam `unread_count` do destinatário
   - Criam notificação para o vendedor

## 📦 Arquivos Criados

### Componentes
- `components/ContactSellerModal.tsx` - Modal de contato

### SQL
- `sql/create_chat_tables.sql` - Estrutura do banco
- `sql/create_chat_triggers.sql` - Automações
- `sql/verify_chat_system.sql` - Verificação

### Páginas Atualizadas
- `pages/AdDetailView.tsx` - Integração do modal

## 🔮 Preparação para Integrações Futuras

### WhatsApp (Preparado)
No arquivo `ContactSellerModal.tsx`, linha 163:
```typescript
// TODO: Integração futura com WhatsApp
// await sendWhatsAppNotification(sellerId, formData.message);
```

### E-mail (Edge Function)
Já existe `sql/edge_function_send_email.sql` para notificações por e-mail.

## 🎨 Componentes UI

- Design moderno com Tailwind CSS
- Animações suaves (fade-in, zoom-in)
- Cores do tema BWAGRO (verde #16a34a)
- Responsivo mobile-first
- Estados de loading e disabled
- Alertas informativos com ícones
- Validação em tempo real

## 🧪 Como Testar

1. Acesse um anúncio (não seu)
2. Clique em "Fale com o Vendedor"
3. Preencha a mensagem e aceite os termos
4. Envie a mensagem
5. Verifique no Supabase:
   - Novo registro em `chats`
   - Novo registro em `messages`
   - Novo registro em `leads`
   - Nova notificação em `notifications`

## ⚠️ Importante

- Execute os scripts SQL **na ordem** indicada
- Não pule o script de verificação
- Todas as tabelas usam UUID como chave primária
- Os triggers são executados automaticamente
- O sistema previne chats duplicados entre as mesmas pessoas no mesmo anúncio
