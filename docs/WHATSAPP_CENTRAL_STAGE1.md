# Central WhatsApp - Etapa 1

## Objetivo

Criar a configuracao segura e independente do gateway externo que sera usado por todos os fluxos de WhatsApp da plataforma. Esta etapa nao cria filas, nao migra o envio atual da Meta e nao faz requisicoes externas.

## Componentes

- `whatsapp_gateway_settings`: configuracao singleton do gateway externo.
- `get_whatsapp_gateway_settings_admin_safe()`: leitura administrativa sem retornar a credencial.
- `update_whatsapp_gateway_settings_admin_safe(...)`: escrita administrativa protegida por MFA.
- `WhatsappGatewaySection`: modulo da Central WhatsApp em Configuracoes > Integracoes.
- `whatsappGateway.ts`: contrato e validacoes compartilhadas para as proximas etapas.

## Seguranca

- A tabela possui RLS habilitada e forcada, sem policies para clientes.
- `anon` e `authenticated` nao possuem acesso direto a tabela.
- As RPCs exigem `public.is_admin()`, que valida administrador com AAL2/MFA.
- A credencial e write-only e nunca aparece no retorno da RPC.
- O gateway inicia desativado.
- A ativacao exige URL, credencial e numero de destino.
- URLs HTTP, credenciais embutidas, caminhos na base e hosts locais/privados sao recusados.
- Os endpoints aceitam apenas caminhos relativos sem query, fragmento ou traversal.

## Contrato reservado para a API externa

Base publica esperada:

```text
https://whatsapp-api.seudominio.com
```

Endpoints padrao:

```text
POST /api/v1/messages
GET  /api/v1/health
```

Autenticacao suportada pela configuracao:

```text
Authorization: Bearer <token>
```

ou assinatura `HMAC-SHA256`, cujo formato exato sera conectado ao dispatcher na etapa 2.

## Aplicacao

1. Execute `sql/create_whatsapp_central_stage1_2026-09-14.sql` no Supabase SQL Editor.
2. Execute `sql/VALIDATE_whatsapp_central_stage1_2026-09-14.sql`.
3. Confirme todos os indicadores booleanos no resultado esperado.
4. Publique o frontend somente depois da migracao.

Rollback, se necessario:

```text
sql/ROLLBACK_create_whatsapp_central_stage1_2026-09-14.sql
```

O rollback remove somente a Central WhatsApp. A integracao existente `whatsapp_settings` da Meta Cloud API permanece intacta.
