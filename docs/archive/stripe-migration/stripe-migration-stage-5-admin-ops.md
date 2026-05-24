# Stripe Migration - Etapa 5

## Objetivo

Dar capacidade operacional ao painel admin para acompanhar e corrigir contexto Stripe sem depender exclusivamente do dashboard externo.

## O que entrou

- Edge Function:
  - `supabase/functions/admin-sync-stripe-subscription/index.ts`
- melhorias visuais e operacionais em:
  - `pages/admin/UserManagement.tsx`
  - `pages/admin/PaymentsManagement.tsx`
  - `components/admin/payments/PaymentsActionsTab.tsx`
  - `components/admin/payments/types.ts`
  - `pages/admin/IntegrationsManagement.tsx`

## Operação nova no admin

### Usuários > Assinaturas

- exibe o gateway (`mercadopago`, `stripe`, `legacy`)
- mostra `provider_subscription_id` e `provider_customer_id` quando existir
- mostra se a assinatura vai cancelar no fim do ciclo
- para assinaturas Stripe, exibe o botão:
  - `Sincronizar Stripe`

### Financeiro

- os pagamentos agora carregam:
  - `provider`
  - `provider_customer_id`
  - `provider_subscription_id`
  - `provider_invoice_id`
  - `provider_checkout_session_id`
- a aba de ações mostra um bloco técnico com os IDs do gateway

### Integrações

- exibe a URL do webhook Mercado Pago
- exibe a URL do webhook Stripe
- os logs de webhook agora ficam mais claros por provedor

## O que a sync manual faz

`admin-sync-stripe-subscription`:

- valida se o operador é admin
- carrega a assinatura Stripe direto da API
- atualiza:
  - status
  - período atual
  - `cancel_at_period_end`
  - `provider_customer_id`
  - `provider_price_id`
- se o `latest_invoice` já estiver pago, garante o registro correspondente em `payments`
- grava auditoria em `admin_audit_logs`

## Para o ambiente atual

Nao precisa rodar SQL novo nesta etapa.

Publique somente:

- `supabase functions deploy admin-sync-stripe-subscription`

## Não precisa publicar agora

- `create-stripe-checkout-session`
- `create-stripe-customer-portal-session`
- `webhook-stripe`

Essas funcoes ja pertencem às etapas anteriores e só precisam de redeploy se você ainda não tiver publicado a versão mais recente delas.
