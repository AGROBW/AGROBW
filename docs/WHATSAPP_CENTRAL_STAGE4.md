# Central WhatsApp - etapa 4 final

Esta etapa conclui a base de integracao do gateway externo e faz a transicao segura do unico fluxo legado de WhatsApp existente: o aviso de novo interessado ao anunciante.

## Entregas

- roteamento de novos leads para a Central WhatsApp quando ela estiver ativa;
- fallback automatico para a fila oficial da Meta enquanto a Central estiver desativada ou incompleta;
- eliminacao de envio duplicado ao substituir o gatilho legado por um unico roteador;
- historico operacional sanitizado no painel, sem telefone, credencial, payload ou mensagem;
- reenvio administrativo restrito a jobs em retentativa ou falha final;
- auditoria server-side para configuracao, templates e reenvio manual;
- template de campanha de anuncio preparado e desativado por padrao.

## Ordem de instalacao

1. Aplique as migracoes das etapas 1, 3 e 4, nessa ordem.
2. Execute os validadores das etapas 1 a 4.
3. Publique `whatsapp-gateway-admin` e `sync-whatsapp-gateway-jobs`.
4. Configure `WHATSAPP_GATEWAY_CRON_SECRET`, `WHATSAPP_GATEWAY_ALLOWED_HOSTS` e `APP_URL` nas Edge Functions.
5. Configure o agendador server-side conforme `WHATSAPP_CENTRAL_STAGE3.md`.
6. Cadastre a URL HTTPS publica e a credencial do gateway no painel.
7. Teste a saude e envie uma mensagem de teste antes de ativar a Central.
8. Execute `sql/VALIDATE_whatsapp_central_routing_transactional_2026-09-15.sql` em staging. Todas as quatro colunas devem retornar `true`; o script termina com rollback.
9. Ative a Central e valide um novo lead real. O job deve aparecer em Entregas recentes.

## Contrato esperado do gateway

O endpoint de envio recebe `POST` JSON com versao, `request_id`, `idempotency_key`, telefone em `to`, tipo `text`, corpo em `text.body` e metadados de origem/evento. O gateway deve tratar `idempotency_key` como unico para impedir duplicidade em retentativas.

O validador transacional tambem emite `VALIDACAO APROVADA` como notice. Qualquer contagem incorreta encerra a execucao com `VALIDACAO REPROVADA`, mesmo que o editor mostre apenas o resultado do `rollback`.

Autenticacao suportada:

- Bearer: header `Authorization`;
- HMAC SHA-256: headers `X-BWAgro-Timestamp` e `X-BWAgro-Signature`, assinando `timestamp.corpo_serializado`.

Uma resposta HTTP 2xx confirma aceite. HTTP 408, 425, 429 e 5xx entram em retentativa. Outros erros HTTP seguem para falha final. O gateway deve devolver 2xx tambem quando reconhecer uma `idempotency_key` ja processada.

## Campanhas de anuncios

O evento `marketing_announcement_campaign` fica desativado e sua ativacao e recusada pela RPC administrativa. Antes de liberar disparos em massa, implemente consentimento especifico para WhatsApp, prova de opt-in, descadastro pelo mesmo canal, limite de frequencia e lista de bloqueio. O consentimento de newsletter por e-mail nao deve ser reutilizado automaticamente para WhatsApp.

Enquanto esses requisitos nao existirem, a campanha permanece oculta no painel e indisponivel para edicao.

## Rollback

Execute os rollbacks obrigatoriamente na ordem 4, 3 e 1. Cada script recusa a execucao quando uma etapa dependente ainda esta instalada. O rollback da etapa 4 restaura o gatilho legado quando sua funcao ainda existir e preserva as etapas 1 a 3.
