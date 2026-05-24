# Etapa 7.2 - Corte operacional controlado do legado

## Objetivo

Preparar a virada final para Stripe sem remover ainda o histórico do Mercado Pago.

Nesta etapa:

- o admin ganha um controle explícito para desligar o fallback operacional do Mercado Pago;
- o checkout passa a priorizar Stripe sempre que o legado não estiver mais disponível;
- o Mercado Pago continua preservado apenas como contingência técnica e base histórica para a Etapa 8.

## O que mudou

### Banco

Arquivo incremental:

- `sql/add_stripe_cutover_phase_7_2.sql`

Entradas principais:

- coluna `payment_settings.mercadopago_runtime_fallback_enabled`
- `get_payment_settings_admin_safe()` devolvendo esse novo campo
- `update_payment_settings_admin_safe(...)` aceitando o novo parâmetro
- `get_checkout_gateway_public_safe()` passando a considerar o fallback desligado na disponibilidade do Mercado Pago

### Frontend / admin

Arquivos:

- `src/hooks/usePaymentSettings.ts`
- `pages/admin/IntegrationsManagement.tsx`

A tela de integrações passa a:

- exibir o toggle de fallback operacional do Mercado Pago
- deixar mais claro que o MP está em condição de legado
- desabilitar o teste manual do Mercado Pago quando o fallback estiver desligado

### Checkout híbrido

Arquivo:

- `services/paymentCheckoutService.ts`

Regra nova:

- se Stripe estiver ativo e o fallback do Mercado Pago estiver desligado, o checkout passa a priorizar Stripe mesmo quando o provedor preferido anterior não estiver mais apontando para o fluxo legado;
- contas ainda não elegíveis recebem mensagem clara orientando a liberação manual ou a continuidade controlada da migração.

## Resultado esperado

Após esta etapa:

- o admin consegue desligar o uso operacional do Mercado Pago sem remover ainda o legado;
- Stripe passa a ser o caminho prático de checkout para as contas elegíveis;
- o projeto fica pronto para a revisão final antes da Etapa 8.

## O que ainda não sai nesta etapa

- `create-preference`
- `webhook-mercadopago`
- `test-mp-connection`
- credenciais e histórico legado do Mercado Pago

Esses itens continuam existindo até a Etapa 8, quando a retirada final for de fato autorizada.
