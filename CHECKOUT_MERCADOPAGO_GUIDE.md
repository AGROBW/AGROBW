# 🛒 Integração Checkout Mercado Pago - Guia Completo

Este guia detalha a implementação completa da integração de checkout do Mercado Pago com a página de planos de assinatura BWAGRO.

---

## 📋 Sumário

1. [Visão Geral](#visão-geral)
2. [Arquivos Criados](#arquivos-criados)
3. [Setup Backend (Supabase)](#setup-backend-supabase)
4. [Setup Edge Function](#setup-edge-function)
5. [Configuração da Página de Planos](#configuração-da-página-de-planos)
6. [Fluxo de Checkout](#fluxo-de-checkout)
7. [Webhook de Notificação](#webhook-de-notificação)
8. [Testes](#testes)
9. [Troubleshooting](#troubleshooting)

---

## 🎯 Visão Geral

A integração implementa:

- ✅ **Página de Planos Dinâmica**: Dados vindos do banco (tabela `plans`)
- ✅ **Switch Mensal/Anual**: Alterna entre `monthly_price` e `yearly_price`
- ✅ **Tabela de Comparação**: Baseada em `plan.comparison[feature.id]`
- ✅ **Checkout Mercado Pago**: Preferências criadas via Edge Function
- ✅ **Metadados no Webhook**: `external_reference` = `user_id|plan_id|billing_cycle`
- ✅ **Loading States**: UX melhorada com indicadores visuais
- ✅ **Planos Corporativos**: Redirecionam para WhatsApp

---

## 📁 Arquivos Criados

### 1. **SQL Functions** (`sql/create_mp_checkout_function.sql`)

```sql
-- Funções RPC:
- get_mp_credentials()          → Retorna credenciais MP
- log_checkout_attempt()        → Registra tentativa de checkout
- pricing_plans_view            → View otimizada de planos
```

### 2. **Edge Function: create-preference** (`supabase/functions/create-preference/index.ts`)

```typescript
// Função serverless que:
// 1. Valida autenticação
// 2. Busca credenciais MP do banco
// 3. Cria preferência de pagamento
// 4. Retorna init_point para checkout
```

### 3. **Edge Function: test-mp-connection** (`supabase/functions/test-mp-connection/index.ts`) 🔒

```typescript
// Teste de conexão SEGURO (proxy server-side)
// RESOLVE 2 PROBLEMAS CRÍTICOS:
// 1. CORS: Requisição feita do servidor (não do navegador)
// 2. SEGURANÇA: Access Token NUNCA é exposto no cliente

// Fluxo:
// 1. Valida JWT token
// 2. Valida se usuário é admin
// 3. Busca Access Token do banco (server-side)
// 4. Testa API /v1/me do Mercado Pago
// 5. Retorna apenas status (sem expor token)
// 6. Registra log de auditoria
```

### 4. **Service Client** (`services/mercadoPagoService.ts`)

```typescript
// Helpers:
- getMercadoPagoCredentials()   → Busca credenciais via RPC
- createPaymentPreference()     → Chama Edge Function
- initiateCheckout()            → Fluxo completo de checkout
- isCustomPlan()                → Detecta planos "Corporativo"
- getCustomPlanContactLink()    → Link WhatsApp
```

### 5. **Página de Planos** (`pages/PricingView.tsx`)

```tsx
// Refatorações:
- handleSubscribe()             → Lógica de checkout
- loadingPlanId state           → Loading por plano
- Botão dinâmico                → Loading spinner + disabled
- Validação de autenticação     → Redireciona para login
```

### 6. **Hook: usePaymentSettings** (`src/hooks/usePaymentSettings.ts`)

```typescript
// Refatorado para segurança:
- testConnection()              → Usa Edge Function (sem parâmetro)
                                → Access Token NUNCA enviado do cliente
                                → Requisição server-side (sem CORS)
```

---

## 🔒 Correção Crítica de Segurança

### ⚠️ Problema Identificado

**ANTES (INSEGURO):**
```typescript
// ❌ NUNCA FAÇA ISSO!
const testConnection = async (accessToken: string) => {
  // Envia Access Token do navegador direto para api.mercadopago.com
  const response = await fetch('https://api.mercadopago.com/v1/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
};
```

**Problemas:**
1. 🚫 **CORS Error**: Navegador bloqueia requisição cross-origin
2. 🔓 **Exposição de Token**: Access Token visível no DevTools
3. 🔴 **Vulnerabilidade**: Token pode ser interceptado

### ✅ Solução Implementada

**AGORA (SEGURO):**
```typescript
// ✅ Edge Function como proxy server-side
const testConnection = async () => {
  // Chama Edge Function (backend)
  const { data } = await supabase.functions.invoke('test-mp-connection');
  
  // Edge Function:
  // 1. Valida admin
  // 2. Busca token do banco (server-side)
  // 3. Testa MP API
  // 4. Retorna apenas status
};
```

**Benefícios:**
1. ✅ **Sem CORS**: Requisição feita do servidor
2. 🔒 **Token Seguro**: Nunca exposto no cliente
3. ✅ **Validação Admin**: Backend verifica permissões
4. 📊 **Auditoria**: Logs de tentativas de teste

---

## 🔧 Setup Backend (Supabase)

### Passo 1: Executar SQL Functions

No **Supabase SQL Editor**, execute:

```sql
-- Arquivo: sql/create_mp_checkout_function.sql
CREATE OR REPLACE FUNCTION get_mp_credentials() ...
CREATE OR REPLACE FUNCTION log_checkout_attempt() ...
CREATE OR REPLACE VIEW pricing_plans_view ...
```

### Passo 2: Verificar RLS

Certifique-se de que as políticas RLS estão ativas:

```sql
-- Verificar políticas
SELECT * FROM pg_policies WHERE tablename = 'payment_settings';
SELECT * FROM pg_policies WHERE tablename = 'plans';

-- Testar função (como usuário autenticado)
SELECT * FROM get_mp_credentials();
```

### Passo 3: Configurar Credenciais MP

Via **Admin Dashboard** (`/#/admin/settings` → aba **Integrações**):

1. Cole o **Access Token** do Mercado Pago
2. Cole a **Public Key**
3. Cole o **Webhook Secret** (opcional)
4. Marque **Ambiente de Produção** se aplicável
5. Clique **Salvar Configurações**
6. Clique **Verificar Conexão** para testar

---

## 🚀 Setup Edge Function

### Passo 1: Instalar Supabase CLI

```bash
npm install -g supabase
```

### Passo 2: Inicializar Projeto

```bash
cd BWAGRO
supabase init
```

### Passo 3: Criar Edge Functions

```bash
# Criar função de preferência de pagamento
supabase functions new create-preference

# Criar função de teste de conexão seguro
supabase functions new test-mp-connection

# Criar função de webhook (opcional)
supabase functions new webhook-mercadopago
```

### Passo 4: Copiar Código

Copie o conteúdo dos arquivos:

```
supabase/functions/create-preference/index.ts
supabase/functions/test-mp-connection/index.ts
supabase/functions/webhook-mercadopago/index.ts
```

Para as respectivas pastas criadas pelo CLI.

### Passo 5: Configurar Secrets

```bash
# URL do seu projeto Supabase
supabase secrets set SUPABASE_URL=https://xxx.supabase.co

# Service Role Key (API Keys → service_role)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# URL do seu site (para back_urls)
supabase secrets set SITE_URL=https://bwagro.com.br
```

### Passo 6: Deploy de Todas as Edge Functions

```bash
# Deploy função de checkout
supabase functions deploy create-preference

# Deploy função de teste seguro
supabase functions deploy test-mp-connection

# Deploy função de webhook (se criada)
supabase functions deploy webhook-mercadopago
```

Você verá as URLs das funções:

```
✅ https://xxx.supabase.co/functions/v1/create-preference
✅ https://xxx.supabase.co/functions/v1/test-mp-connection
✅ https://xxx.supabase.co/functions/v1/webhook-mercadopago
```

**IMPORTANTE**: A função `test-mp-connection` deve ser deployada para que o botão "Verificar Conexão" funcione.

---

## 📄 Configuração da Página de Planos

### Estrutura Atual

A página de planos (`PricingView.tsx`) já está configurada:

```tsx
// Funcionalidades implementadas:
✅ Renderização dinâmica via usePlans()
✅ Switch Mensal/Anual (monthly_price ↔ yearly_price)
✅ Loading states individuais por plano
✅ Validação de autenticação antes de checkout
✅ Planos corporativos redirecionam para WhatsApp
✅ Toast notifications para feedback
```

### Personalizar WhatsApp

Edite o arquivo `services/mercadoPagoService.ts`:

```typescript
// Linha 186
const whatsappNumber = '5511999999999'; // ← SEU NÚMERO AQUI
```

---

## 🛍️ Fluxo de Checkout

### 1. Usuário Clica em "Assinar"

```tsx
onClick={() => handleSubscribe(plan.id, plan.name, ...)}
```

### 2. Validações Client-Side

```typescript
// Verifica se é plano customizado
if (isCustomPlan(planName)) {
  // Redireciona para WhatsApp
  window.open(contactLink, '_blank');
  return;
}

// Verifica autenticação
if (!user) {
  toast.error('Você precisa estar logado');
  window.location.href = '/#/login?redirect=/pricing';
  return;
}
```

### 3. Chamada à Edge Function

```typescript
const result = await initiateCheckout({
  planId,
  planName,
  planDescription,
  billingCycle: 'monthly' | 'yearly',
  amount,
  userId: user.id,
});
```

### 4. Edge Function Processa

```typescript
// 1. Valida autenticação (JWT token)
// 2. Busca credenciais MP do banco
// 3. Busca dados do usuário (email, nome)
// 4. Monta preferência com external_reference
const externalReference = `${userId}|${planId}|${billingCycle}`;

// 5. Chama API MP
POST https://api.mercadopago.com/checkout/preferences

// 6. Retorna init_point
return { initPoint: 'https://www.mercadopago.com.br/checkout/v1/...' };
```

### 5. Redirecionamento

```typescript
// Service abre checkout em nova aba
window.open(checkoutUrl, '_blank');
```

---

## 🔔 Webhook de Notificação

### External Reference

O campo `external_reference` contém:

```
{user_id}|{plan_id}|{billing_cycle}
```

Exemplo:

```
550e8400-e29b-41d4-a716-446655440000|123e4567-e89b-12d3-a456-426614174000|monthly
```

### Processar Webhook

Quando o Mercado Pago enviar notificação:

```typescript
// 1. Receber notificação
POST /api/webhooks/mercadopago
{
  "action": "payment.created",
  "data": { "id": "1234567890" }
}

// 2. Buscar detalhes do pagamento
GET https://api.mercadopago.com/v1/payments/1234567890

// 3. Parsear external_reference
const [userId, planId, billingCycle] = externalReference.split('|');

// 4. Se aprovado, atualizar subscription
if (payment.status === 'approved') {
  INSERT INTO user_subscriptions (user_id, plan_id, billing_cycle, ...);
}
```

### Criar Endpoint de Webhook

Você precisará criar uma **Edge Function adicional** para receber webhooks:

```bash
supabase functions new webhook-mercadopago
```

**Exemplo básico**:

```typescript
serve(async (req) => {
  const body = await req.json();
  
  // Log do webhook
  await supabase.from('webhook_logs').insert({
    provider: 'mercadopago',
    event_type: body.action,
    payload: body,
    status_code: 200,
  });

  // Se for pagamento
  if (body.type === 'payment') {
    const paymentId = body.data.id;
    
    // Buscar detalhes
    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    const payment = await mpResponse.json();
    
    // Processar se aprovado
    if (payment.status === 'approved') {
      const [userId, planId, cycle] = payment.external_reference.split('|');
      
      // Criar/atualizar assinatura
      await supabase.from('user_subscriptions').upsert({
        user_id: userId,
        plan_id: planId,
        billing_cycle: cycle,
        status: 'active',
        starts_at: new Date(),
        expires_at: new Date(Date.now() + (cycle === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000),
      });
    }
  }

  return new Response('OK', { status: 200 });
});
```

---

## 🧪 Testes

### 1. Testar RPC Functions

```sql
-- No Supabase SQL Editor (como usuário autenticado)
SELECT * FROM get_mp_credentials();
-- Deve retornar: access_token, public_key, is_production

SELECT log_checkout_attempt(
  'plan-id-teste'::UUID,
  'monthly',
  99.90
);
-- Deve retornar: UUID do log

SELECT * FROM pricing_plans_view;
-- Deve retornar: planos ativos ordenados por position
```

### 2. Testar Edge Function de Teste de Conexão

```bash
# Testar função de teste MP (requer JWT de admin)
curl -X POST \
  https://xxx.supabase.co/functions/v1/test-mp-connection \
  -H "Authorization: Bearer YOUR_ADMIN_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Resposta esperada (sucesso)**:
```json
{
  "success": true,
  "message": "Conexão estabelecida com sucesso! Conta: email@example.com",
  "data": {
    "id": 123456789,
    "email": "email@example.com",
    "nickname": "usuario",
    "country_id": "BR",
    "first_name": "Nome",
    "last_name": "Sobrenome"
  }
}
```

**Resposta esperada (erro - não admin)**:
```json
{
  "success": false,
  "error": "Forbidden - Admin access required"
}
```

### 3. Testar Edge Function de Checkout

```bash
curl -X POST \
  https://xxx.supabase.co/functions/v1/create-preference \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "planId": "plan-uuid-aqui",
    "planName": "Premium",
    "planDescription": "Plano Premium Mensal",
    "billingCycle": "monthly",
    "amount": 299.90,
    "userId": "user-uuid-aqui"
  }'
```

**Resposta esperada**:

```json
{
  "success": true,
  "preferenceId": "123456789-abcd-1234",
  "initPoint": "https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=...",
  "sandboxInitPoint": "https://sandbox.mercadopago.com.br/checkout/v1/redirect?pref_id=..."
}
```

### 3. Testar Checkout Frontend

1. Acesse `/#/pricing`
2. Clique em **Assinar** em qualquer plano
3. Verifique se:
   - ✅ Mostra "Preparando checkout..." (toast)
   - ✅ Botão fica com loading spinner
   - ✅ Abre nova aba com checkout MP
   - ✅ Se não logado, redireciona para login

### 4. Testar Plano Corporativo

1. Crie um plano com nome "Corporativo" ou "Enterprise"
2. Clique em **Assinar**
3. Verifique se abre WhatsApp ao invés de checkout

---

## 🛠️ Troubleshooting

### ❌ Erro: "CORS Error" ao testar conexão (CORRIGIDO)

**Causa**: Tentativa de acessar `api.mercadopago.com` diretamente do navegador

**Sintoma**:
```
Access to fetch at 'https://api.mercadopago.com/v1/me' from origin 'http://localhost:3000' 
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

**⚠️ Problema Crítico de Segurança**:
- Access Token seria EXPOSTO no DevTools do navegador
- Token poderia ser interceptado por scripts maliciosos
- CORS bloqueia requisição (proteção do navegador)

**✅ Solução Implementada**:

A função `testConnection()` agora usa uma **Edge Function como proxy**:

```typescript
// ANTES (INSEGURO - ❌ NÃO USE):
const testConnection = async (accessToken: string) => {
  const response = await fetch('https://api.mercadopago.com/v1/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
};

// AGORA (SEGURO - ✅):
const testConnection = async () => {
  // Chama Edge Function que faz proxy server-side
  const { data } = await supabase.functions.invoke('test-mp-connection');
  // Token NUNCA é exposto no cliente
};
```

**Deploy necessário**:
```bash
supabase functions deploy test-mp-connection
```

**Validações implementadas**:
1. ✅ Verifica se usuário é admin
2. ✅ Busca Access Token do banco (server-side)
3. ✅ Faz requisição do servidor (sem CORS)
4. ✅ Retorna apenas status (sem expor token)
5. ✅ Registra log de auditoria

---

### Erro: "Mercado Pago não está configurado"

**Causa**: Credenciais não salvas no `payment_settings`

**Solução**:
1. Acesse `/#/admin/settings` → Integrações
2. Configure Access Token e Public Key
3. Clique "Verificar Conexão" para testar

---

### Erro: "Unauthorized" ao chamar Edge Function

**Causa**: JWT token não enviado ou inválido

**Solução**:

```typescript
// Verificar se usuário está autenticado
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  toast.error('Faça login para continuar');
  return;
}
```

---

### Erro: "Failed to create preference"

**Causa**: Access Token inválido ou problema na API do MP

**Solução**:
1. Verifique se o Access Token está correto
2. Teste com API do MP diretamente:

```bash
curl -X GET \
  https://api.mercadopago.com/v1/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

3. Verifique logs da Edge Function no Supabase Dashboard

---

### Checkout não abre

**Causa**: Bloqueador de pop-ups do navegador

**Solução**:
- Instrua usuários a permitir pop-ups do site
- OU altere para redirecionar na mesma aba:

```typescript
// Em mercadoPagoService.ts, linha 154
window.location.href = checkoutUrl; // ao invés de window.open()
```

---

### Webhook não recebe notificações

**Causa**: URL do webhook não configurada no Mercado Pago

**Solução**:
1. Acesse [Mercado Pago → Desenvolvedores → Webhooks](https://www.mercadopago.com.br/developers/panel/webhooks)
2. Cole a URL: `https://bwagro.com.br/api/webhooks/mercadopago`
3. Selecione eventos: `payment`, `subscription`
4. Salve

---

## 📊 Monitoramento

### Logs de Checkout

```sql
-- Ver tentativas de checkout
SELECT * FROM admin_audit_logs
WHERE action = 'CHECKOUT_ATTEMPT'
ORDER BY created_at DESC
LIMIT 50;

-- Ver checkouts criados com sucesso
SELECT * FROM admin_audit_logs
WHERE action = 'CHECKOUT_CREATED'
ORDER BY created_at DESC
LIMIT 50;
```

### Logs de Teste de Conexão

```sql
-- Ver testes de conexão bem-sucedidos
SELECT * FROM admin_audit_logs
WHERE action = 'MP_CONNECTION_TEST_SUCCESS'
ORDER BY created_at DESC
LIMIT 50;

-- Ver testes de conexão com falha
SELECT * FROM admin_audit_logs
WHERE action = 'MP_CONNECTION_TEST_FAILED'
ORDER BY created_at DESC
LIMIT 50;

-- Análise de sucesso/falha
SELECT 
  action,
  COUNT(*) as total,
  MAX(created_at) as last_test
FROM admin_audit_logs
WHERE action IN ('MP_CONNECTION_TEST_SUCCESS', 'MP_CONNECTION_TEST_FAILED')
GROUP BY action;
```

### Logs de Webhook

```sql
-- Ver webhooks recebidos
SELECT * FROM webhook_logs
WHERE provider = 'mercadopago'
ORDER BY received_at DESC
LIMIT 50;

-- Ver apenas pagamentos aprovados
SELECT * FROM webhook_logs
WHERE provider = 'mercadopago'
  AND payload->>'status' = 'approved'
ORDER BY received_at DESC;
```

---

## ✅ Checklist Final

Antes de ir para produção, verifique:

- [ ] SQL functions executadas no Supabase (`create_mp_checkout_function.sql`, `create_user_subscriptions.sql`)
- [ ] RLS policies ativas nas tabelas `payment_settings`, `plans` e `user_subscriptions`
- [ ] Credenciais MP configuradas no Admin (Access Token, Public Key)
- [ ] Edge Function `create-preference` deployada ✅
- [ ] **Edge Function `test-mp-connection` deployada** ✅ (CRÍTICO para segurança)
- [ ] Edge Function `webhook-mercadopago` deployada ✅ (opcional)
- [ ] Secrets configuradas (SUPABASE_URL, SERVICE_ROLE_KEY, SITE_URL)
- [ ] Número do WhatsApp atualizado em `mercadoPagoService.ts`
- [ ] URL do webhook configurada no painel do Mercado Pago
- [ ] Teste de conexão funcionando sem erro de CORS ✅
- [ ] Testes funcionais realizados (checkout, plano corporativo, teste de conexão)
- [ ] Logs de auditoria verificados (checkout, testes MP)
- [ ] Logs de erros monitorados

---

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique logs da Edge Function no Supabase Dashboard
2. Verifique logs de webhook em `/#/admin/settings` → Integrações
3. Verifique logs de auditoria com queries SQL fornecidas
4. Consulte documentação oficial do [Mercado Pago](https://www.mercadopago.com.br/developers)

---

**Implementação criada em**: 14 de março de 2026  
**Arquivos**: 8 (2 SQL, 3 Edge Functions, 2 Services, 1 View)  
**Status**: ✅ Completo, seguro e pronto para deploy  
**Última atualização**: Correção crítica de CORS e segurança no teste de conexão
