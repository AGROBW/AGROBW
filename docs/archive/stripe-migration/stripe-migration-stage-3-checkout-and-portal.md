# Etapa 3 - Checkout Stripe e portal do cliente

Esta etapa adiciona o checkout Stripe para planos em paralelo ao Mercado Pago e prepara o portal do cliente para contas que ja tiverem assinatura Stripe confirmada.

## O que entrou

- `plans`
  - `stripe_monthly_price_id`
  - `stripe_yearly_price_id`

- RPC publica segura
  - `get_checkout_gateway_public_safe()`

- Edge Functions novas
  - `create-stripe-checkout-session`
  - `create-stripe-customer-portal-session`

- Frontend
  - `services/paymentCheckoutService.ts`
  - `PricingView.tsx` passa a escolher Stripe ou Mercado Pago para planos
  - `UserDashboardView.tsx` mostra acesso ao portal Stripe quando a conta ja tiver vinculo Stripe
  - `PlansManagement.tsx` passa a cadastrar os `price_id` da Stripe no admin

## O que continua no Mercado Pago nesta etapa

- checkout de boosters
- webhook operacional
- ciclo real de ativacao/renovacao da assinatura

## Comportamento esperado

- se `preferred_checkout_provider = stripe`
- e Stripe estiver configurado
- e o plano tiver `price_id` do ciclo escolhido

entao o checkout de plano abre a sessao Stripe.

Caso contrario, o fluxo segue no Mercado Pago.

## O que ainda falta para concluir a migracao funcional

- webhook Stripe para ativar e renovar assinaturas
- persistencia completa dos ids da Stripe apos pagamento confirmado
- migracao operacional dos assinantes antigos
- desligamento gradual do Mercado Pago
