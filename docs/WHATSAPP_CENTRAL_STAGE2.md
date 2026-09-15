# Central WhatsApp - Etapa 2

## Objetivo

Adicionar o conector server-side do gateway externo e permitir que um administrador com MFA valide a conexao e envie uma mensagem fixa de teste. Os eventos reais da plataforma ainda nao sao encaminhados nesta etapa.

## Edge Function

Nome: `whatsapp-gateway-admin`

Operacoes aceitas pelo frontend:

```json
{ "action": "health" }
```

```json
{ "action": "test_message" }
```

O navegador nao pode informar telefone nem mensagem. O teste usa exclusivamente o destino administrativo salvo e um texto fixo.

## Contrato do gateway externo

Saude:

```text
GET <base_url><health_path>
```

Mensagem:

```text
POST <base_url><send_path>
Content-Type: application/json
X-Request-Id: <uuid>
```

```json
{
  "version": "2026-09-14",
  "request_id": "uuid",
  "idempotency_key": "uuid",
  "to": "5564999999999",
  "type": "text",
  "text": { "body": "mensagem" },
  "metadata": { "source": "bwagro_admin_test" }
}
```

No modo Bearer, a API recebe `Authorization: Bearer <credencial>`.

No modo HMAC, recebe:

```text
X-BWAgro-Timestamp: <unix-seconds>
X-BWAgro-Signature: sha256=<hex(HMAC-SHA256(secret, timestamp + "." + rawBody))>
```

Para o health check, `rawBody` e uma string vazia.

## Seguranca

- O endpoint exige usuario administrador com token AAL2/MFA.
- A credencial e lida somente pela Edge Function com `service_role`.
- O navegador nao recebe nem envia a credencial durante os testes.
- A URL e revalidada e o DNS deve resolver apenas para enderecos publicos.
- Redirecionamentos HTTP sao recusados.
- As requisicoes externas expiram em 8 segundos.
- O corpo retornado pelo gateway e descartado e nunca repassado ao navegador.
- Health checks permitem 10 chamadas por minuto; mensagens de teste, 3 a cada 5 minutos.
- Se o rate limiter estiver indisponivel, a operacao falha fechada.
- Cada tentativa autorizada e registrada no `admin_audit_logs` antes da chamada externa. Se a auditoria estiver indisponivel, o envio e bloqueado.

## Publicacao futura

Depois da migration da etapa 1, publique a funcao:

```text
sql/VALIDATE_whatsapp_central_stage2_2026-09-14.sql
supabase functions deploy whatsapp-gateway-admin
```

Todos os indicadores do validador SQL devem retornar `true` antes da publicacao da funcao.

A etapa 3 criara a fila universal, templates e produtores de eventos. Ate la, nenhuma notificacao real usa o gateway externo.
