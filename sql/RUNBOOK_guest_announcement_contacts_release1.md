# Contato visitante com vendedor - release 1

## Escopo

Visitantes sem sessao podem enviar um primeiro contato ao vendedor sem criar
chat ou usuario artificial. O vendedor recebe a mensagem por e-mail e responde
diretamente ao endereco informado. O fluxo autenticado permanece inalterado.

Este release nao adiciona o contato visitante ao painel de leads. Essa
integracao depende de uma regra explicita de acesso por plano e fica para um
release posterior, junto da conversao por link magico.

## Protecoes

- CAPTCHA validado na Edge Function;
- anuncio, status, validade e vendedor resolvidos no servidor;
- no maximo 5 contatos por IP/hora e 3 por e-mail/hora;
- a mesma mensagem para o mesmo anuncio/e-mail e idempotente por 15 minutos;
- o IP nunca e armazenado em claro; IP e e-mail usados nos limites recebem
  identificadores HMAC-SHA256;
- tabela sem acesso para `anon` e sem gravacao direta para `authenticated`;
- RPC de criacao executavel apenas por `service_role`;
- snapshot das versoes de Termos e Privacidade no momento do aceite;
- conteudo do visitante escapado antes de entrar no HTML do e-mail.

O e-mail, o telefone opcional e a mensagem ficam em claro na tabela privada
porque sao os dados entregues ao vendedor e integram o registro do
consentimento. Este release nao cria uma promessa de expurgo automatico: a
retencao segue a politica juridica vigente e qualquer limpeza deve ser medida
e executada pelo procedimento administrativo existente.

## Segredos necessarios

Configurar antes de publicar a Edge Function:

- `GUEST_CONTACT_HASH_SECRET`: valor aleatorio forte, exclusivo deste uso;
- `HCAPTCHA_SECRET_KEY`: se `VITE_HCAPTCHA_SITE_KEY` estiver ativo; ou
- `TURNSTILE_SECRET_KEY`: se `VITE_TURNSTILE_SITE_KEY` estiver ativo.

A funcao falha fechada com HTTP 503 se o segredo do provedor ou o segredo de
hash nao estiver configurado.

## Ordem de implantacao

1. Aplicar `sql/create_guest_announcement_contacts_2026-09-10.sql`.
2. Configurar os segredos da Edge Function.
3. Publicar `sync-contact-notification-emails`.
4. Publicar `submit-guest-announcement-contact` com `verify_jwt=false`.
5. Publicar o site.
6. Executar o smoke abaixo antes de considerar o release concluido.

O SQL vem primeiro porque a nova Edge Function depende da tabela e da RPC. A
funcao de notificacao vem antes do site para que qualquer job visitante ja seja
interpretado corretamente quando o primeiro contato entrar.

## Smoke

1. Visitante, anuncio ativo, CAPTCHA valido: HTTP 201 e `status=received`.
2. Repetir os mesmos dados em ate 15 minutos: HTTP 200 e
   `status=already_received`; nenhuma linha ou job adicional.
3. Conferir uma linha em `guest_announcement_contacts` e um job `guest_lead`
   em `contact_notification_email_jobs`.
4. Processar a fila e confirmar e-mail entregue ao vendedor, mensagem completa
   (inclusive depois do caractere 160), `Reply-To` igual ao e-mail do visitante
   e telefone exibido quando informado.
5. CAPTCHA invalido: HTTP 400 e nenhuma linha criada.
6. Anuncio pausado, expirado ou inexistente: HTTP 409 e nenhuma linha criada.
7. Quarta tentativa do mesmo e-mail em uma hora: HTTP 429.
8. Usuario autenticado: conversa, lead e mensagem continuam sendo criados pelo
   fluxo anterior.

## Rollback

1. Promover o deployment anterior do site para interromper novos envios.
2. Processar ou registrar os jobs `guest_lead` ainda pendentes.
3. Republicar a versao anterior de `sync-contact-notification-emails`.
4. Remover `submit-guest-announcement-contact`.
5. Executar `sql/ROLLBACK_guest_announcement_contacts_release1.sql`.

O rollback foi construido a partir do estado medido imediatamente antes da
implantacao: 14 jobs, zero referencias invalidas e as constraints originais
`contact_notification_email_jobs_check` e
`contact_notification_email_jobs_source_kind_check`. O script aborta se houver
job `guest_lead` ainda nao entregue, restaura literalmente as duas regras e nao
usa `drop ... cascade`.
