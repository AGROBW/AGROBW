# Sistema Completo de Mensagens e Leads - Documentação

## ✅ Status de Implementação

### Frontend (100% Completo)
- ✅ **MessagesView.tsx** - Central de mensagens em tempo real
- ✅ **LeadsView.tsx** - Painel de gerenciamento de leads  
- ✅ **ContactSellerModal.tsx** - Modal de contato inicial
- ✅ **UserDashboardView.tsx** - Rotas e badges configurados

### Backend (100% Completo)
- ✅ Tabelas: chats, messages, leads, notifications
- ✅ RLS (Row Level Security) completo
- ✅ Triggers automáticos
- ✅ Índices de performance
- ✅ VIEW consolidada (chats_full)
- ✅ Hooks com Supabase Realtime

## 🎯 Funcionalidades Detalhadas

### 1. Central de Mensagens (MessagesView.tsx)

#### Sidebar de Conversas
- **Lista de chats ativos** ordenados por última mensagem
- **Avatar do anúncio** como identificação visual
- **Nome do interlocutor** (comprador ou vendedor)
- **Última mensagem** com preview truncado
- **Badge de não lidas** (contador vermelho)
- **Timestamp relativo** ("há 5 minutos", "há 2 horas")
- **Busca em tempo real** filtra por nome, título do anúncio ou conteúdo

#### Área de Chat
- **Header com contexto**: avatar, nome, título do anúncio, preço
- **Histórico de mensagens** com scroll automático
- **Mensagens próprias** (fundo verde, alinhadas à direita)
- **Mensagens recebidas** (fundo branco, alinhadas à esquerda)
- **Indicadores de leitura**:
  - ✓ (um check) = Enviada
  - ✓✓ (dois checks) = Lida
- **Avatar do remetente** nas mensagens de terceiros
- **Timestamps relativos** em cada mensagem

#### Input de Mensagem
- **Campo de texto** com placeholder
- **Botão Enviar** desabilitado se vazio
- **Enter para enviar** (Shift+Enter para quebra de linha)
- **Feedback visual** durante envio

#### Realtime
- **Supabase Realtime** via `postgres_changes`
- **Atualizações instantâneas** quando novas mensagens chegam
- **Auto-marcação como lida** quando visualizada
- **Sincronização automática** dos contadores

### 2. Painel de Leads (LeadsView.tsx)

#### Estatísticas no Topo
Cards com métricas:
- **Total** de leads recebidos
- **Novos** (status: new) - Badge azul
- **Contatados** (status: contacted) - Badge amarelo
- **Negociando** (status: negotiating) - Badge roxo
- **Fechados** (status: closed) - Badge verde
- **Perdidos** (status: lost) - Badge vermelho
- **Taxa de Conversão** calculada automaticamente

#### Filtros
- **Botões de filtro** por status
- **Contador** em cada filtro
- **"Todos"** mostra leads de todos os status
- **Destaque visual** no filtro ativo

#### Lista de Leads
Cada card de lead exibe:
- **Imagem do anúncio** (thumbnail 80x80px)
- **Nome do comprador** em destaque
- **Título do anúncio** vinculado
- **Badge de status** com ícone e cor
- **Preço do anúncio** formatado (BRL)
- **Dados de contato**:
  - 📧 E-mail (clicável)
  - 📞 Telefone com máscara
  - 📍 CEP formatado
  - 📅 Tempo desde o contato
- **Mensagem inicial** (preview com line-clamp-2)
- **Botão "Responder"** vai direto para o chat
- **Dropdown de status** para alterar (Novo → Contatado → Negociando → Fechado)

#### Ações
- **Responder** - Navega para `/minha-conta/mensagens?chat={chatId}`
- **Alterar Status** - Dropdown com opções de workflow
- **Atualização otimista** (UI atualiza antes da confirmação)

### 3. Menu do Dashboard

#### Badges Numéricos
- **Mensagens**: soma de `unread_count` de todos os chats
- **Leads**: contagem de leads com `status = 'new'`
- **Notificações**: total de notificações não lidas
- **Design**: badges vermelhos com número branco

#### Rotas Configuradas
```
/minha-conta              → HomeDashboard
/minha-conta/anuncios     → AdsDashboard
/minha-conta/mensagens    → MessagesView
/minha-conta/leads        → LeadsView
/minha-conta/financeiro   → FinanceDashboard
/minha-conta/perfil       → ProfileDashboard
```

## 🔒 Segurança Implementada

### Row Level Security (RLS)

#### Tabela: chats
```sql
-- SELECT: Apenas participantes (buyer_id OU seller_id)
-- INSERT: Apenas compradores (buyer_id = auth.uid())
-- UPDATE: Apenas participantes
```

#### Tabela: messages
```sql
-- SELECT: Apenas participantes do chat vinculado
-- INSERT: Apenas sender_id = auth.uid() E participante do chat
-- UPDATE: Apenas participantes (para marcar como lida)
```

#### Tabela: leads
```sql
-- SELECT: Apenas buyer_id OU seller_id
-- INSERT: Apenas buyer_id = auth.uid()
-- UPDATE: Apenas seller_id (alterar status)
```

#### Tabela: notifications
```sql
-- SELECT: Apenas user_id = auth.uid()
-- UPDATE: Apenas user_id = auth.uid()
-- INSERT: Sistema (sem restrição, triggers criam)
```

### Proteções no Frontend
- **useAuth()** valida sessão antes de qualquer ação
- **auth.uid()** capturado no backend via RLS
- **Campos readonly** para dados pré-preenchidos
- **Validação de propriedade** (não pode enviar mensagem ao próprio anúncio)
- **Verificação de chatId** antes de permitir enviar mensagens

## 🚀 Fluxo Completo

### 1. Usuário Vê Anúncio
1. Acessa `/anuncio/{id}`
2. Clica em **"Fale com o Vendedor"**
3. Sistema verifica autenticação
4. Modal abre com dados pré-preenchidos

### 2. Envio Inicial
1. Usuário preenche mensagem
2. Aceita termos e envia
3. Backend verifica se chat existe
4. **Se não existe**:
   - Cria registro em `chats`
   - Cria registro em `leads` (status: new)
5. Insere mensagem em `messages`
6. Triggers automáticos:
   - Atualizam `last_message` e `last_message_time`
   - Incrementam `unread_count_seller`
   - Criam notificação para o vendedor

### 3. Vendedor Recebe
1. Badge no menu **"Leads"** incrementa
2. Badge no menu **"Mensagens"** incrementa
3. Notificação aparece no sistema
4. Vendedor vai para `/minha-conta/leads`
5. Vê novo lead com status **"Novo"** (azul)
6. Clica em **"Responder"**

### 4. Chat Inicia
1. Redireciona para `/minha-conta/mensagens?chat={chatId}`
2. Chat abre automaticamente
3. Mensagem inicial aparece no histórico
4. Vendedor responde
5. **Realtime** entrega mensagem instantaneamente
6. Comprador vê mensagem em tempo real
7. Sistema marca como lida automaticamente

### 5. Gestão do Lead
1. Vendedor atualiza status: Novo → Contatado
2. Após negociação: Contatado → Negociando
3. Venda confirmada: Negociando → Fechado
4. Ou não deu certo: Qualquer status → Perdido
5. **Taxa de conversão** atualiza automaticamente

## 📊 Banco de Dados

### Tabelas Criadas

#### chats
```sql
- id (UUID, PK)
- announcement_id (UUID, FK → announcements)
- buyer_id (UUID, FK → users)
- seller_id (UUID, FK → users)
- last_message (TEXT)
- last_message_time (TIMESTAMPTZ)
- unread_count_buyer (INTEGER)
- unread_count_seller (INTEGER)
- created_at, updated_at (TIMESTAMPTZ)

CONSTRAINT: (announcement_id, buyer_id, seller_id) UNIQUE
CONSTRAINT: buyer_id != seller_id
```

#### messages
```sql
- id (UUID, PK)
- chat_id (UUID, FK → chats)
- sender_id (UUID, FK → users)
- content (TEXT NOT NULL)
- is_read (BOOLEAN)
- created_at, updated_at (TIMESTAMPTZ)

CONSTRAINT: trim(content) != ''
```

#### leads
```sql
- id (UUID, PK)
- chat_id (UUID, FK → chats)
- announcement_id (UUID, FK → announcements)
- buyer_id, seller_id (UUID, FK → users)
- buyer_name, buyer_email (TEXT NOT NULL)
- buyer_phone, buyer_cep (TEXT)
- initial_message (TEXT NOT NULL)
- status (ENUM: new, contacted, negotiating, closed, lost)
- created_at, updated_at (TIMESTAMPTZ)
```

#### notifications
```sql
- id (UUID, PK)
- user_id (UUID, FK → users)
- type (ENUM: new_message, new_lead, system)
- title, message (TEXT NOT NULL)
- link (TEXT)
- is_read (BOOLEAN)
- created_at (TIMESTAMPTZ)
```

### VIEW: chats_full
Consolida chats + announcements + users (buyer/seller) para facilitar queries.

### Triggers Automáticos

1. **update_chat_last_message()** - Atualiza chat quando mensagem é inserida
2. **create_message_notification()** - Cria notificação para destinatário
3. **create_lead_notification()** - Notifica vendedor sobre novo lead
4. **reset_unread_count()** - Decrementa contador quando mensagem é lida
5. **update_updated_at_column()** - Atualiza timestamps automaticamente

## 🛠️ Scripts SQL

### Executar na Ordem:
1. **create_chat_tables.sql** - Cria estrutura completa
2. **create_chat_triggers.sql** - Adiciona automações
3. **create_chats_view.sql** - Cria VIEW consolidada
4. **verify_chat_system.sql** - Verifica instalação

## 🧪 Como Testar

### Teste 1: Envio de Mensagem Inicial
1. Logout e faça login com Usuário A
2. Crie um anúncio
3. Logout e faça login com Usuário B
4. Acesse o anúncio do Usuário A
5. Clique "Fale com o Vendedor"
6. Envie uma mensagem
7. **Verificar**: Chat criado, lead registrado, notificação enviada

### Teste 2: Resposta em Tempo Real
1. Mantenha Usuário B na tela de mensagens
2. Em outra aba/janela, faça login com Usuário A
3. Vá para `/minha-conta/mensagens`
4. Selecione o chat com Usuário B
5. Envie uma mensagem
6. **Verificar**: Mensagem aparece instantaneamente na tela do Usuário B

### Teste 3: Gestão de Leads
1. Usuário A (vendedor) vai para `/minha-conta/leads`
2. Vê o lead do Usuário B com status "Novo"
3. Clica no dropdown e altera para "Contatado"
4. **Verificar**: Status atualiza, estatísticas recalculam

### Teste 4: Badges de Notificação
1. Usuário A envia mensagem para Usuário B
2. Usuário B (sem abrir mensagens) verifica menu
3. **Verificar**: Badge "Mensagens" incrementa
4. Usuário B abre o chat
5. **Verificar**: Badge decrementa após leitura

## 📱 Responsividade

- **Mobile**: Lista de chats em fullscreen, chat abre sobrepondo
- **Tablet**: Layout híbrido com botão "voltar"
- **Desktop**: Split view (lista + chat lado a lado)
- **Breakpoint**: `md` (768px)

## 🎨 Design System

### Cores
- **Verde primário**: `#16a34a` (green-600)
- **Cinza texto**: `#334155` (slate-700)
- **Backgrounds**: `#f8fafc` (slate-50)
- **Bordas**: `#e2e8f0` (slate-200)

### Status Colors
- **Novo**: Azul (`blue-600`)
- **Contatado**: Amarelo (`yellow-600`)
- **Negociando**: Roxo (`purple-600`)
- **Fechado**: Verde (`green-600`)
- **Perdido**: Vermelho (`red-600`)

### Ícones (lucide-react)
- MessageSquare, Send, Search, Check, CheckCheck
- Clock, Mail, Phone, MapPin, Calendar
- TrendingUp, CheckCircle, XCircle, ExternalLink

## 🔮 Melhorias Futuras

### Planejadas
- [ ] Integração WhatsApp (hook preparado no ContactSellerModal)
- [ ] Notificações push (Web Push API)
- [ ] Upload de imagens no chat
- [ ] Áudio/vídeo chamadas
- [ ] Respostas automáticas com IA
- [ ] Análise de sentimento das mensagens
- [ ] Exportação de leads (CSV/Excel)
- [ ] CRM integrado para vendedores premium

### Otimizações
- [ ] Paginação infinita na lista de mensagens
- [ ] Cache de chats com React Query
- [ ] Compressão de imagens do anúncio
- [ ] Lazy loading dos avatares
- [ ] Service Worker para offline-first

## 📞 Suporte

Se houver problemas:
1. Verifique se os scripts SQL foram executados na ordem
2. Confirme que RLS está habilitado nas 4 tabelas
3. Teste as políticas com `SELECT * FROM chats` (deve retornar apenas seus chats)
4. Verifique o console do navegador para erros
5. Inspecione a aba Network para chamadas à API do Supabase

## ✅ Checklist de Instalação

- [x] Executar `create_chat_tables.sql`
- [x] Executar `create_chat_triggers.sql`
- [x] Executar `create_chats_view.sql`
- [x] Executar `verify_chat_system.sql` (confirmar)
- [x] Build do frontend sem erros
- [x] Teste end-to-end completo
- [x] Verificar Realtime funcionando
- [x] Confirmar segurança RLS

---

**Sistema 100% Funcional e Pronto para Produção! 🚀**
