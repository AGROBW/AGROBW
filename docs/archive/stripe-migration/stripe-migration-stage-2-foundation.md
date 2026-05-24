# Etapa 2 - Fundacao Stripe em paralelo

Esta etapa prepara o projeto para conviver com Mercado Pago e Stripe ao mesmo tempo, sem substituir o checkout atual ainda.

## O que entrou

- `payment_settings`
  - `stripe_secret_key`
  - `stripe_publishable_key`
  - `stripe_webhook_secret`
  - `preferred_checkout_provider`

- `payments`
  - `provider_customer_id`
  - `provider_subscription_id`
  - `provider_invoice_id`
  - `provider_checkout_session_id`

- `user_subscriptions`
  - `provider`
  - `provider_customer_id`
  - `provider_subscription_id`
  - `provider_price_id`
  - `provider_checkout_session_id`

- RPCs admin seguras atualizadas
  - `get_payment_settings_admin_safe()`
  - `update_payment_settings_admin_safe(...)`

- Painel admin atualizado
  - Mercado Pago continua configuravel
  - Stripe passa a ter area propria de credenciais
  - `preferred_checkout_provider` fica salvo como controle de rollout

## O que ainda nao entrou nesta etapa

- checkout Stripe publico
- criacao de sessao Checkout / Elements
- webhook Stripe
- sincronizacao do ciclo de assinatura com Stripe
- portal do cliente Stripe
- migracao operacional dos assinantes antigos

## Leitura de seguranca

Nesta etapa:

- Mercado Pago continua sendo o caminho operacional atual
- Stripe fica salvo e pronto para as proximas etapas
- nao removemos campos nem funcoes do Mercado Pago
- a base passa a aceitar identificadores genericos de gateway para pagamentos e assinaturas
