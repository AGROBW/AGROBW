## Etapa 6 - Rollout gradual Stripe

### Objetivo
Permitir a virada controlada para Stripe sem forcar a migracao imediata de toda a base.

### O que entra nesta etapa
- configuracao administrativa do modo de rollout da Stripe
- regra publica segura para decidir, por usuario autenticado, se o checkout Stripe pode ser usado
- fallback automatico para Mercado Pago quando a conta ainda precisa permanecer no fluxo legado
- bloqueio server-side da criacao de checkout Stripe quando a conta nao for elegivel

### Modos de rollout
- `all_customers`
  - toda conta autenticada elegivel usa Stripe quando o provedor preferido for Stripe
- `new_customers`
  - apenas contas sem historico pago usam Stripe
  - contas com historico pago seguem no Mercado Pago

### Como a elegibilidade eh calculada
Uma conta passa a ser tratada como cliente pago legado se existir pelo menos um destes sinais:
- pagamento aprovado em `payments` com valor maior que zero
- assinatura em `user_subscriptions` vinculada a plano pago ou com `amount_paid` maior que zero

### Comportamento do checkout
- se o admin escolher Stripe como provedor preferido e a conta atual estiver elegivel, o checkout segue para Stripe
- se a conta nao estiver elegivel e o Mercado Pago estiver configurado, o sistema faz fallback automatico para Mercado Pago
- se a conta nao estiver elegivel e nao houver Mercado Pago disponivel, o checkout retorna erro explicando que a conta ainda esta no fluxo legado

### Arquivos principais
- `sql/add_stripe_rollout_phase_6.sql`
- `services/paymentCheckoutService.ts`
- `supabase/functions/create-stripe-checkout-session/index.ts`
- `src/hooks/usePaymentSettings.ts`
- `pages/admin/IntegrationsManagement.tsx`

### Observacao operacional
Esta etapa nao migra clientes antigos para Stripe.
Ela apenas cria o controle para que novos clientes possam entrar no novo gateway com seguranca, mantendo a base legada estavel.
