# Stripe Migration - Etapa 4

## Objetivo

Colocar a Stripe como fonte real do ciclo de assinatura sem desligar o Mercado Pago legado.

## O que entrou

- migration incremental: `sql/add_stripe_webhook_phase_4.sql`
- Edge Function: `supabase/functions/webhook-stripe/index.ts`
- compatibilidade de status em:
  - `sql/create_user_subscriptions.sql`
  - `src/hooks/useSubscription.ts`
  - `src/hooks/usePlanCheck.ts`
  - `pages/admin/UserManagement.tsx`

## Eventos Stripe tratados

- `checkout.session.completed`
  - salva contexto inicial do cliente/assinatura
  - vincula `provider_checkout_session_id` quando possivel

- `invoice.paid`
  - cria/atualiza pagamento em `payments`
  - ativa/sincroniza assinatura em `user_subscriptions`
  - registra notificação ao usuário
  - tenta enfileirar a emissão fiscal via `issue-nfse`

- `invoice.payment_failed`
  - cria/atualiza pagamento com falha
  - muda a assinatura para `past_due`
  - registra notificação ao usuário

- `customer.subscription.updated`
  - sincroniza status, período, price id e cancelamento programado

- `customer.subscription.deleted`
  - sincroniza a assinatura como cancelada

## Regras da etapa

- Mercado Pago continua funcionando em paralelo.
- Stripe só assume a verdade de assinaturas criadas/processadas por ela.
- Boosters continuam fora do fluxo Stripe nesta etapa.
- O relatório e o admin ainda nao fazem conciliacao detalhada Stripe; isso entra na Etapa 5.

## Para o ambiente atual

Executar somente:

- `sql/add_stripe_webhook_phase_4.sql`

Depois publicar somente:

- `supabase functions deploy webhook-stripe`

## Nao executar agora

- `sql/create_user_subscriptions.sql`
- `sql/security_sprint_1_hardening.sql`
- `sql/create_payments_financial_center.sql`
- `sql/add_stripe_payment_foundation_phase_2.sql`
- `sql/add_stripe_checkout_phase_3.sql`

## Observações

- O endpoint precisa ser configurado na Stripe com o `Webhook Secret` salvo no admin.
- Os dados novos da Stripe passam a ser sincronizados de forma automática; o histórico antigo do Mercado Pago continua preservado.
