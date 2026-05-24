# Etapa 8 - Corte final operacional do Mercado Pago

## Objetivo

Concluir a migração para Stripe como gateway operacional único, preservando apenas o histórico legado do Mercado Pago em registros, auditorias e relatórios antigos.

## O que mudou

### Runtime

- `services/paymentCheckoutService.ts`
  - remove o fallback operacional para Mercado Pago
  - novos checkouts de plano e booster passam a usar somente Stripe

- `pages/PricingView.tsx`
- `components/finance/RecommendedUpgradeModal.tsx`
  - deixam de depender do `mercadoPagoService`
  - o fluxo de compra passa a assumir Stripe como checkout oficial

### Admin

- `pages/admin/IntegrationsManagement.tsx`
  - remove configuração operacional do Mercado Pago da tela principal
  - mantém apenas a gestão Stripe
  - preserva o acompanhamento histórico da transição

- `pages/admin/FiscalSettingsManagement.tsx`
  - remove a instrução operacional do webhook Mercado Pago do checklist fiscal

### Supabase / deploy

- `supabase/config.toml`
  - `test-mp-connection`, `create-preference` e `webhook-mercadopago` ficam desabilitadas

### Banco

- `sql/finalize_stripe_migration_phase_8.sql`
  - limpa credenciais operacionais do Mercado Pago em `payment_settings`
  - força `preferred_checkout_provider = 'stripe'`
  - força `stripe_rollout_mode = 'all_customers'`
  - força `mercadopago_runtime_fallback_enabled = false`
  - recria as RPCs seguras de configuração e gateway público em modo Stripe-only
  - remove `get_mp_credentials()`

### Defaults estruturais

- `sql/create_payment_integrations.sql`
  - passa a nascer com Stripe como gateway padrão

- `sql/create_payments_financial_center.sql`
  - pagamentos novos passam a nascer com `provider = 'stripe'`

- `sql/create_user_subscriptions.sql`
  - assinaturas novas passam a nascer com `provider = 'stripe'`

- `src/hooks/usePayments.ts`
  - fallback local do provider passa a ser `stripe`

## O que permanece por segurança histórica

- tabela `mp_processed_payments`
- campos legados de Mercado Pago em `user_subscriptions`
- Edge Functions antigas preservadas no repositório
- pagamentos históricos com `provider = 'mercadopago'`

Esses itens continuam apenas para consulta histórica e compatibilidade de auditoria, não para operação de novos checkouts.
