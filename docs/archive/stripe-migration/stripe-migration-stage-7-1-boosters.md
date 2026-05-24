## Etapa 7.1 - boosters e limpeza do runtime legado

### Objetivo
Fechar os principais bloqueios antes da retirada final do Mercado Pago:
- boosters passam a poder usar Stripe
- webhook Stripe passa a creditar compras de booster
- textos operacionais do usuario deixam de assumir Mercado Pago como unico gateway

### O que entrou
- coluna `highlight_boosters.stripe_price_id`
- admin de boosters preparado para cadastrar o `Price ID` da Stripe
- checkout hibrido de boosters em `paymentCheckoutService`
- `create-stripe-checkout-session` suportando:
  - `item_type = booster`
  - validacao de plano pago ativo
  - validacao de limite de compras em 30 dias
- `webhook-stripe` suportando:
  - pagamento avulso de booster
  - criacao/atualizacao de `payments`
  - credito via `register_highlight_booster_purchase`
  - notificacao ao usuario

### Como fica a operacao
- se Stripe estiver preferido e liberado para a conta:
  - plano usa Stripe
  - booster tambem usa Stripe
- se a conta ainda estiver no fluxo legado:
  - booster continua podendo cair no fallback antigo enquanto a migracao convive

### Resultado
Depois desta etapa, o principal bloqueio funcional antes da Etapa 8 deixa de ser o produto booster.
O legado de Mercado Pago continua existindo apenas como fallback operacional temporario e nao mais como dependencia exclusiva desse modulo.
