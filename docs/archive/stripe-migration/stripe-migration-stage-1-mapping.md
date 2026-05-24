# Etapa 1 · Mapeamento da integração atual de pagamentos

Este documento consolida a situação atual da integração de pagamentos baseada em Mercado Pago no projeto e serve como base para a migração gradual para Stripe.

## 1. Resumo executivo

Hoje o projeto depende do Mercado Pago em quatro frentes principais:

1. **Checkout público de planos e boosters**
2. **Configuração administrativa de credenciais e webhook**
3. **Processamento assíncrono via webhook**
4. **Persistência financeira e ativação de assinatura**

A troca para Stripe não é só de gateway visual. Ela impacta:

- telas públicas
- edge functions
- webhooks
- auditoria
- tabelas de pagamentos
- criação de assinatura
- painel administrativo
- textos e indicadores visíveis ao usuário

## 2. Fluxo atual do checkout

### 2.1 Origem do checkout

O checkout nasce em:

- `pages/PricingView.tsx`
- `services/mercadoPagoService.ts`
- `pages/UserDashboardView.tsx` para boosters

### 2.2 Como funciona hoje

1. O usuário escolhe um plano ou booster em `PricingView`
2. O frontend chama `initiateCheckout(...)` em `services/mercadoPagoService.ts`
3. Esse service:
   - valida se Mercado Pago está configurado
   - registra tentativa com `log_checkout_attempt`
   - chama a Edge Function `create-preference`
4. A função `supabase/functions/create-preference/index.ts`:
   - valida JWT
   - carrega plano/booster
   - consulta `payment_settings`
   - cria uma preferência no Mercado Pago
   - devolve `initPoint` / `sandboxInitPoint`
5. O frontend abre o checkout em nova aba com `window.open(...)`

### 2.3 Arquivos envolvidos

- `services/mercadoPagoService.ts`
- `pages/PricingView.tsx`
- `pages/UserDashboardView.tsx`
- `supabase/functions/create-preference/index.ts`
- `sql/create_mp_checkout_function.sql`

## 3. Configuração administrativa atual

Hoje o painel admin já possui um módulo dedicado ao Mercado Pago:

- `pages/admin/IntegrationsManagement.tsx`
- `src/hooks/usePaymentSettings.ts`

### 3.1 O que o admin configura hoje

- `mp_access_token`
- `mp_public_key`
- `mp_webhook_secret`
- `is_production`

### 3.2 Base de dados usada

As credenciais ficam em:

- `payment_settings`

Schema base:

- `sql/create_payment_integrations.sql`
- endurecimento/acesso seguro:
  - `sql/security_sprint_1_hardening.sql`

### 3.3 RPCs usados pelo admin

- `get_payment_settings_admin_safe`
- `update_payment_settings_admin_safe`

### 3.4 Teste de conexão

O admin testa conexão com:

- `supabase/functions/test-mp-connection/index.ts`

## 4. Webhook atual do Mercado Pago

Hoje o processamento principal de confirmação de pagamento está em:

- `supabase/functions/webhook-mercadopago/index.ts`

### 4.1 O que esse webhook faz hoje

- valida assinatura do webhook com `mp_webhook_secret`
- deduplica requests com `webhook_request_registry`
- consulta o pagamento na API do Mercado Pago
- persiste/atualiza a linha em `payments`
- processa pagamento aprovado
- cria assinatura em `user_subscriptions`
- expira assinatura ativa anterior, quando necessário
- credita booster, quando o item é booster
- gera notificações para o usuário
- dispara emissão fiscal (`issue-nfse`) quando aplicável
- grava log em `webhook_logs`

### 4.2 Tabelas diretamente afetadas pelo webhook

- `payments`
- `user_subscriptions`
- `mp_processed_payments`
- `webhook_logs`
- `webhook_request_registry`
- `notifications`
- `admin_audit_logs`
- `user_highlight_booster_purchases` (indiretamente, via RPC de booster)

### 4.3 Edge functions relacionadas

- `supabase/functions/webhook-mercadopago/index.ts`
- `supabase/functions/issue-nfse/index.ts`

## 5. Modelo de dados atual impactado pela migração

## 5.1 `payment_settings`

Hoje está centrado em Mercado Pago:

- `mp_access_token`
- `mp_public_key`
- `mp_webhook_secret`
- `is_production`

Observação:
- essa tabela já possui um desenho que aceita expansão para múltiplos provedores, mas a implementação atual está orientada para MP.

## 5.2 `payments`

Hoje o projeto usa uma tabela mais genérica, o que ajuda bastante na migração.

Campos relevantes:

- `provider`
- `provider_payment_id`
- `provider_preference_id`
- `external_reference`
- `billing_cycle`
- `status`
- `status_detail`
- `payment_method`
- `receipt_url`
- `invoice_*`
- `metadata`

Arquivo base:

- `sql/create_payments_financial_center.sql`

Leitura no frontend:

- `src/hooks/usePayments.ts`
- `pages/admin/PaymentsManagement.tsx`
- componentes em `components/admin/payments/*`
- `pages/UserDashboardView.tsx`

### Ponto importante

Essa tabela já está relativamente preparada para coexistir com outro provedor, desde que:

- `provider` passe a aceitar `stripe`
- `provider_payment_id` e `provider_preference_id` ganhem equivalentes do Stripe
- `metadata` absorva IDs específicos do Stripe

## 5.3 `user_subscriptions`

Aqui ainda existe forte legado de Mercado Pago.

Arquivo base:

- `sql/create_user_subscriptions.sql`

Campos legados explícitos:

- `mp_payment_id`
- `mp_preference_id`
- `mp_external_reference`
- `mp_status`
- `mp_status_detail`

Além disso, há regras de negócio diretamente associadas ao ciclo:

- `billing_cycle`
- `current_period_start`
- `current_period_end`
- `status`

### Ponto importante

Essa tabela é um dos maiores pontos de refatoração, porque hoje o ciclo da assinatura ainda é montado a partir da lógica do webhook do Mercado Pago.

## 5.4 `mp_processed_payments`

Tabela específica de deduplicação do Mercado Pago:

- `sql/create_mp_processed_payments.sql`

Essa tabela é **100% específica de MP** e deverá ser:

- substituída por tabela genérica de processamento de eventos
- ou espelhada por uma nova tabela Stripe equivalente

## 6. Painéis e telas impactados

## 6.1 Público / usuário

### Tela de preços

- `pages/PricingView.tsx`

Depende hoje de:

- `services/mercadoPagoService.ts`
- labels e fluxos de checkout MP

### Painel do usuário

- `pages/UserDashboardView.tsx`

Exibe hoje:

- pagamentos
- forma de pagamento
- cobrança mensal/anual
- comprovante
- texto de confirmação do Mercado Pago
- compra avulsa de booster via MP

### Hooks envolvidos

- `src/hooks/usePayments.ts`

## 6.2 Admin

### Integrações

- `pages/admin/IntegrationsManagement.tsx`

Hoje é explicitamente Mercado Pago:

- textos
- credenciais
- webhook URL
- logs
- teste de conexão

### Financeiro

- `pages/admin/PaymentsManagement.tsx`
- `components/admin/payments/*`

Hoje essa área já é mais genérica, mas ainda parte do histórico e provider atual.

### Configurações fiscais

- `pages/admin/FiscalSettingsManagement.tsx`

Há referências operacionais ao webhook do MP por conta do fluxo de emissão fiscal.

## 7. Funções, RPCs e artefatos ligados ao Mercado Pago

## 7.1 Services / frontend

- `services/mercadoPagoService.ts`

## 7.2 Edge functions

- `supabase/functions/create-preference/index.ts`
- `supabase/functions/webhook-mercadopago/index.ts`
- `supabase/functions/test-mp-connection/index.ts`
- `supabase/functions/diag-mp-connection/*`

## 7.3 SQL / RPC

- `sql/create_mp_checkout_function.sql`
- `sql/create_mp_processed_payments.sql`
- `sql/create_payment_integrations.sql`
- `sql/security_sprint_1_hardening.sql`
- `sql/create_user_subscriptions.sql`

## 8. Regras de negócio atuais que precisam ser preservadas na migração

Ao trocar o provedor, estas regras não podem ser perdidas:

1. **Plano mensal vs anual**
   - o ciclo de cobrança impacta validade e vigência do plano

2. **Plano gratuito / Start**
   - não pode passar por checkout normal
   - tem bloqueios específicos de elegibilidade

3. **Compra avulsa de booster**
   - não é assinatura
   - é cobrança pontual
   - credita saldo após aprovação

4. **Expiração/substituição de assinatura ativa**
   - ao ativar nova assinatura, a anterior é expirada

5. **Notificação ao usuário**
   - aprovação e recusa disparam notificações

6. **Emissão fiscal**
   - pagamento aprovado pode disparar NFS-e

7. **Auditoria**
   - o checkout e a ativação deixam rastros no admin

## 9. Riscos principais da substituição

## 9.1 Risco técnico

- substituir só o checkout visual sem trocar o webhook quebra a ativação real
- substituir o webhook sem adaptar `user_subscriptions` quebra o ciclo do plano
- trocar provider sem revisar `payments` e `usePayments` gera histórico inconsistente

## 9.2 Risco operacional

- clientes ativos do Mercado Pago não podem ser migrados “na marra” sem estratégia
- o admin hoje opera credenciais e logs MP; isso precisa continuar funcional até o corte final

## 9.3 Risco de produto

- hoje o fluxo aceita booster + assinatura no mesmo stack
- Stripe precisa absorver ambos, ou o sistema fica híbrido por mais tempo

## 10. Recomendação para a Etapa 2

Com base no estado atual do projeto, a Etapa 2 deve ser:

1. **preparar compatibilidade de schema**
   - adicionar campos/tabelas Stripe sem remover MP

2. **introduzir provider genérico de checkout**
   - serviço novo, sem apagar `mercadoPagoService.ts` ainda

3. **deixar o admin com configuração paralela**
   - Mercado Pago continua operando
   - Stripe entra lado a lado

4. **criar webhook Stripe sem desligar o MP**
   - só depois fazer novos clientes entrarem por Stripe

## 11. Arquivos críticos para a migração

### Altíssima prioridade

- `services/mercadoPagoService.ts`
- `pages/PricingView.tsx`
- `supabase/functions/create-preference/index.ts`
- `supabase/functions/webhook-mercadopago/index.ts`
- `src/hooks/usePayments.ts`
- `pages/admin/IntegrationsManagement.tsx`
- `src/hooks/usePaymentSettings.ts`
- `sql/create_user_subscriptions.sql`
- `sql/create_payments_financial_center.sql`
- `sql/create_payment_integrations.sql`

### Média prioridade

- `pages/UserDashboardView.tsx`
- `pages/admin/PaymentsManagement.tsx`
- `pages/admin/FiscalSettingsManagement.tsx`
- `supabase/functions/issue-nfse/index.ts`
- `sql/create_mp_processed_payments.sql`

## 12. Decisão arquitetural recomendada

Para este projeto, o caminho mais seguro é:

- **novos pagamentos entram por Stripe**
- **Mercado Pago continua vivo temporariamente para histórico e base legada**
- **admin opera ambos durante a transição**
- **webhook Stripe ativa novas assinaturas**
- **Mercado Pago só sai na etapa final**

Isso evita uma troca brusca e reduz o risco sobre:

- usuários ativos
- histórico financeiro
- notas fiscais
- boosters
- painéis operacionais
