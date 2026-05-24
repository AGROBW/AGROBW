## Etapa 7 - Migracao operacional controlada

### Objetivo
Executar a virada real para Stripe sem migrar toda a base de uma vez.

### O que entra nesta etapa
- allowlist manual para liberar contas legadas especificas
- resumo operacional no admin para acompanhar a convivencia entre Stripe e Mercado Pago
- regra de elegibilidade atualizada no banco para considerar a allowlist

### Como fica a logica
- clientes novos continuam elegiveis pela regra automatica da Etapa 6
- clientes com historico pago continuam no fluxo legado por padrao
- quando a equipe quiser migrar uma conta legada especifica, ela entra na allowlist administrativa
- a partir desse momento, mesmo no modo `new_customers`, essa conta passa a poder abrir checkout Stripe

### Estrutura criada
- tabela `public.stripe_rollout_overrides`
  - registra quais contas legadas foram liberadas manualmente
- RPCs administrativas:
  - `get_stripe_rollout_summary_admin_safe()`
  - `list_stripe_rollout_overrides_admin_safe()`
  - `search_users_for_stripe_rollout_admin_safe(text)`
  - `upsert_stripe_rollout_override_admin_safe(uuid, text)`
  - `delete_stripe_rollout_override_admin_safe(uuid)`

### Admin
Na tela de integracoes:
- resumo com clientes legados, allowlist manual e assinaturas ativas por gateway
- busca por nome/e-mail
- liberacao manual para Stripe
- remocao da allowlist

### Resultado operacional
Esta etapa permite um rollout real por cohort:
- novos clientes entram pela Stripe
- clientes antigos continuam estaveis no Mercado Pago
- contas legadas estrategicas podem ser movidas manualmente para o novo gateway, sem cutover brusco
