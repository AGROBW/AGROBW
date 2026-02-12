# 🧪 Guia de Testes - Sistema de Mensagens e Leads

## Pré-requisitos
- [ ] Scripts SQL executados (install_complete_chat_system.sql)
- [ ] Aplicação rodando localmente
- [ ] 2 contas de usuário criadas (Usuário A e Usuário B)

## Teste 1: Envio de Mensagem Inicial ✉️

### Passo a Passo
1. **Usuário A (Vendedor)**
   - Faça login
   - Crie um anúncio qualquer
   - Publique o anúncio
   - Anote o ID do anúncio

2. **Usuário B (Comprador)**
   - Faça logout do Usuário A
   - Faça login com Usuário B
   - Acesse o anúncio criado pelo Usuário A
   - Clique no botão **"Fale com o Vendedor"**

3. **Verificações**
   - [ ] Modal abre corretamente
   - [ ] Campos estão pré-preenchidos com dados do Usuário B
   - [ ] Campos estão readonly (não editáveis)
   - [ ] Mensagem pré-preenchida com template

4. **Envio**
   - Edite a mensagem
   - Marque o checkbox de termos
   - Clique em **"Enviar Mensagem"**

5. **Confirmações Backend**
   ```sql
   -- No Supabase SQL Editor:
   
   -- Verificar chat criado
   SELECT * FROM chats WHERE announcement_id = 'SEU_ANNOUNCEMENT_ID' LIMIT 1;
   
   -- Verificar lead criado
   SELECT * FROM leads WHERE announcement_id = 'SEU_ANNOUNCEMENT_ID' LIMIT 1;
   
   -- Verificar mensagem inserida
   SELECT * FROM messages WHERE chat_id = 'SEU_CHAT_ID' LIMIT 1;
   
   -- Verificar notificação enviada
   SELECT * FROM notifications WHERE user_id = 'ID_DO_USUARIO_A' ORDER BY created_at DESC LIMIT 1;
   ```

### Resultado Esperado ✅
- Toast de sucesso aparece
- Modal fecha automaticamente
- 1 registro em `chats`
- 1 registro em `leads` (status: 'new')
- 1 registro em `messages`
- 1 notificação para o vendedor

---

## Teste 2: Visualização de Lead pelo Vendedor 📊

### Passo a Passo
1. **Usuário A (Vendedor)**
   - Faça login
   - Acesse `/minha-conta/leads`

2. **Verificações**
   - [ ] Card de estatísticas aparece no topo
   - [ ] "Novos" mostra 1
   - [ ] Lead do Usuário B aparece na lista
   - [ ] Badge azul "Novo" está visível
   - [ ] Dados de contato aparecem (email, telefone, CEP)
   - [ ] Mensagem inicial é exibida
   - [ ] Botão "Responder" está presente

3. **Testar Filtros**
   - Clique em cada filtro de status
   - [ ] Lista atualiza conforme seleção
   - [ ] Contador nos botões está correto

### Resultado Esperado ✅
- Painel carrega sem erros
- Lead aparece na lista
- Dados estão corretos
- Filtros funcionam

---

## Teste 3: Resposta via Chat 💬

### Passo a Passo
1. **Usuário A (Vendedor)**
   - Na tela de leads, clique em **"Responder"**

2. **Verificações**
   - [ ] Redireciona para `/minha-conta/mensagens`
   - [ ] Chat abre automaticamente
   - [ ] Mensagem inicial do comprador aparece
   - [ ] Header mostra: anúncio, nome do comprador, preço

3. **Enviar Resposta**
   - Digite uma resposta
   - Pressione Enter ou clique "Enviar"

4. **Confirmações**
   ```sql
   -- Verificar nova mensagem
   SELECT * FROM messages WHERE chat_id = 'SEU_CHAT_ID' ORDER BY created_at DESC LIMIT 1;
   
   -- Verificar atualização do chat
   SELECT last_message, unread_count_buyer FROM chats WHERE id = 'SEU_CHAT_ID';
   ```

### Resultado Esperado ✅
- Mensagem aparece instantaneamente no chat
- `last_message` do chat é atualizado
- `unread_count_buyer` incrementa para 1
- Notificação criada para o Usuário B

---

## Teste 4: Realtime - Mensagens Instantâneas ⚡

### Passo a Passo
1. **Setup**
   - Abra 2 janelas/abas do navegador lado a lado
   - Janela 1: Login com Usuário A
   - Janela 2: Login com Usuário B

2. **Ambos Navegam**
   - Ambos vão para `/minha-conta/mensagens`
   - Ambos selecionam o mesmo chat

3. **Teste de Envio**
   - Usuário A envia uma mensagem
   - **Observar janela do Usuário B**

4. **Verificações**
   - [ ] Mensagem aparece INSTANTANEAMENTE na janela do Usuário B
   - [ ] Sem necessidade de refresh
   - [ ] Scroll automático para última mensagem
   - [ ] Indicador de leitura atualiza

5. **Teste Reverso**
   - Usuário B responde
   - **Observar janela do Usuário A**
   - [ ] Mensagem aparece instantaneamente

### Resultado Esperado ✅
- Mensagens aparecem em tempo real
- Latência < 500ms
- Sincronização perfeita
- Indicadores de leitura funcionam

---

## Teste 5: Badges de Notificação 🔴

### Passo a Passo
1. **Usuário B (Comprador)**
   - Faça login
   - Vá para qualquer página EXCETO `/minha-conta/mensagens`
   - Observe o menu lateral (ou mobile)

2. **Verificações Iniciais**
   - [ ] Badge "Mensagens" mostra 1 (mensagem não lida)
   - [ ] Badge é vermelho com número branco

3. **Usuário A Envia Outra Mensagem**
   - Em outra janela, Usuário A envia nova mensagem

4. **Verificações Dinâmicas**
   - [ ] Badge atualiza para 2 (sem refresh manual)
   - [ ] Realtime funciona para badges também

5. **Marcar como Lida**
   - Usuário B abre `/minha-conta/mensagens`
   - Seleciona o chat
   - **Observar badge no menu**

6. **Confirmação**
   - [ ] Badge diminui ou desaparece
   - [ ] Contador reflete mensagens não lidas reais

### Resultado Esperado ✅
- Badges atualizam automaticamente
- Contadores estão corretos
- Visual limpo e profissional

---

## Teste 6: Gestão de Status de Lead 📈

### Passo a Passo
1. **Usuário A (Vendedor)**
   - Vá para `/minha-conta/leads`
   - Localize o lead do Usuário B

2. **Alterar Status: Novo → Contatado**
   - Clique no dropdown
   - Selecione "Marcar como Contatado"

3. **Verificações**
   - [ ] UI atualiza instantaneamente (otimista)
   - [ ] Badge muda de azul para amarelo
   - [ ] Card de "Contatados" incrementa
   - [ ] Card de "Novos" decrementa
   - [ ] Taxa de conversão recalcula

4. **Verificação Backend**
   ```sql
   SELECT id, status, updated_at FROM leads WHERE id = 'SEU_LEAD_ID';
   ```

5. **Continuar Workflow**
   - Contatado → Negociando (roxo)
   - Negociando → Fechado (verde)

6. **Verificar Estatísticas**
   - [ ] Card "Fechados" = 1
   - [ ] Taxa de conversão > 0%

### Resultado Esperado ✅
- Transições de status suaves
- Estatísticas sempre corretas
- Histórico preservado

---

## Teste 7: Segurança RLS 🔒

### Passo a Passo
1. **Tentar Acessar Chat de Outro Usuário**
   - Copie um `chat_id` de outro usuário
   - No console do navegador:
   ```javascript
   // Tentar ler chat alheio
   supabase.from('chats').select('*').eq('id', 'CHAT_ID_ALHEIO').single()
   ```

2. **Resultado Esperado**
   - [ ] Retorna vazio ou erro de permissão
   - [ ] RLS bloqueia acesso

3. **Tentar Inserir Mensagem como Outro Usuário**
   ```javascript
   supabase.from('messages').insert({
     chat_id: 'ALGUM_CHAT_ID',
     sender_id: 'OUTRO_USER_ID', // ID diferente do seu
     content: 'Tentativa de fraude'
   })
   ```

4. **Resultado Esperado**
   - [ ] Erro de RLS policy
   - [ ] Mensagem não é inserida

5. **Verificar VIEW chats_full**
   ```sql
   -- Como Usuário A
   SELECT COUNT(*) FROM chats_full; -- Deve retornar apenas chats do Usuário A
   ```

### Resultado Esperado ✅
- Isolamento completo entre usuários
- Impossível acessar dados alheios
- auth.uid() validado em todas as operações

---

## Teste 8: Responsividade Mobile 📱

### Passo a Passo
1. **Abrir DevTools**
   - Pressione F12
   - Toggle device toolbar (Ctrl+Shift+M)
   - Selecione "iPhone 12 Pro" ou similar

2. **Testar Mensagens**
   - Vá para `/minha-conta/mensagens`

3. **Verificações**
   - [ ] Lista de chats ocupa tela inteira
   - [ ] Chat selecionado sobrepõe a lista
   - [ ] Botão "voltar" (←) aparece no header do chat
   - [ ] Input de mensagem responsivo
   - [ ] Scroll touch funciona suavemente

4. **Testar Leads**
   - Vá para `/minha-conta/leads`
   - [ ] Cards empilham verticalmente
   - [ ] Estatísticas em grid 2x3
   - [ ] Filtros quebram linha se necessário
   - [ ] Dados de contato truncam corretamente

### Resultado Esperado ✅
- Layout perfeito em mobile
- Sem overflow horizontal
- Touch gestures funcionam
- Performance fluida

---

## Checklist Final de Validação ✅

### Backend
- [ ] 4 tabelas criadas e populadas
- [ ] RLS habilitado e funcional
- [ ] Triggers executando automaticamente
- [ ] VIEW `chats_full` retornando dados
- [ ] Índices criados e em uso

### Frontend
- [ ] MessagesView carrega sem erros
- [ ] LeadsView exibe estatísticas corretas
- [ ] ContactSellerModal abre e envia
- [ ] Badges numéricos funcionam
- [ ] Realtime sincroniza < 1s

### Segurança
- [ ] RLS bloqueia acessos não autorizados
- [ ] auth.uid() validado em todas as queries
- [ ] Campos sensíveis protegidos
- [ ] Logs não expõem informações privadas

### UX
- [ ] Fluxo intuitivo e sem fricção
- [ ] Feedbacks visuais claros
- [ ] Loading states apropriados
- [ ] Mobile-first responsivo
- [ ] Acessibilidade básica

---

## 🐛 Troubleshooting

### Mensagens não aparecem em tempo real
```sql
-- Verificar canal Realtime
SELECT * FROM pg_stat_replication;

-- Verificar permissões
GRANT ALL ON messages TO authenticated;
```

### Badges não atualizam
```javascript
// No hook useChats, verificar:
const { chats } = useChats(); // Deve retornar dados
console.log('Unread:', chats.reduce((sum, c) => sum + c.unreadCount, 0));
```

### Erro ao criar chat
```sql
-- Verificar constraint
SELECT * FROM chats WHERE announcement_id = 'ID' AND buyer_id = 'ID' AND seller_id = 'ID';
-- Se retornar, chat já existe
```

### VIEW chats_full vazia
```sql
-- Verificar permissões
GRANT SELECT ON chats_full TO authenticated, anon;

-- Testar query direta
SELECT * FROM chats_full WHERE buyer_id = auth.uid() OR seller_id = auth.uid();
```

---

## 📊 Métricas de Sucesso

| Métrica | Alvo | Como Medir |
|---------|------|------------|
| Latência Realtime | < 500ms | DevTools Network |
| Taxa de Entrega | 100% | Comparar enviadas vs recebidas |
| Conversão de Leads | > 10% | Cards de estatísticas |
| Tempo de Resposta | < 5min | Timestamps nas mensagens |
| Erros RLS | 0 | Logs do Supabase |

---

**Todos os testes passaram? Sistema validado! 🎉**
