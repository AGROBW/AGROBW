# Central WhatsApp - etapa 3

Esta etapa adiciona a automacao duravel das notificacoes administrativas. Ela nao substitui nem altera o envio existente pela API oficial da Meta.

## Componentes

- catalogo administravel com cinco eventos iniciais;
- fila idempotente sem credencial ou telefone persistidos nos jobs;
- gatilhos para moderacao de anuncios, edicoes, denuncias, suporte e campanhas de Loja Parceira;
- worker interno com reserva atomica, lease de 10 minutos, retentativas exponenciais e fila de falhas;
- resumo operacional e edicao de templates em `Configuracoes > Integracoes`.

## Aplicacao

1. Aplique `sql/create_whatsapp_central_stage1_2026-09-14.sql` caso a etapa 1 ainda nao exista.
2. Aplique `sql/create_whatsapp_central_stage3_2026-09-14.sql`.
3. Execute `sql/VALIDATE_whatsapp_central_stage3_2026-09-14.sql` e confirme que todas as colunas retornam `true`.
4. Publique `whatsapp-gateway-admin` e `sync-whatsapp-gateway-jobs`.
5. Configure `WHATSAPP_GATEWAY_CRON_SECRET` com um segredo longo e aleatorio no ambiente da Edge Function.
6. Configure `WHATSAPP_GATEWAY_ALLOWED_HOSTS` com os hosts exatos permitidos, separados por virgula e sem protocolo ou caminho.
7. Configure um agendador server-side para chamar `sync-whatsapp-gateway-jobs` por `POST`, enviando o segredo no header `x-cron-secret`. O corpo opcional aceita apenas `{ "limit": 10 }`, entre 1 e 25.

Os eventos so entram na fila quando a Central WhatsApp esta ativa, possui URL/credencial e o template correspondente esta habilitado. O worker usa `APP_URL` para acrescentar o link administrativo confiavel ao final da mensagem.

## Seguranca

- navegador, `anon` e usuários autenticados nao acessam diretamente a fila;
- leitura e alteracao de templates passam por RPC administrativa protegida por `is_admin()`;
- reserva e transicao dos jobs exigem `service_role`;
- chamadas ao gateway repetem a protecao SSRF, nao seguem redirects, descartam o corpo da resposta e expiram em 8 segundos;
- o worker exige segredo interno com comparacao de tempo constante e limita o tamanho da requisicao;
- a chave `(event_type, event_key)` impede duplicidade do mesmo evento.
- mensagens de suporte usam o relogio do banco, agrupamento de 10 minutos e limite global de cinco alertas por usuario nessa janela; a coordenacao concorrente usa tentativas nao bloqueantes limitadas a cerca de 200 ms;
- alertas administrativos com mais de 24 horas sao encerrados como expirados antes do envio; avisos de lead nao expiram silenciosamente;
- falhas anteriores a criacao do job aparecem no contador operacional das ultimas 24 horas.

## Rollback

Use `sql/ROLLBACK_create_whatsapp_central_stage3_2026-09-14.sql`. O rollback remove apenas a automacao, os templates e a fila da etapa 3; as configuracoes e os testes manuais das etapas anteriores permanecem intactos.
