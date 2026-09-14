# Contatos visitantes na caixa do vendedor

Esta entrega inclui banco, Edge Function de e-mail e interface da caixa de mensagens.

## Publicacao

1. Aplicar `add_guest_contacts_to_seller_inbox_stage1_2026-09-14.sql` no banco.
2. Publicar a Edge Function `sync-contact-notification-emails`.
3. Publicar o frontend somente depois que a migracao e a Edge Function estiverem ativas.
4. Confirmar que a consulta final retorna as cinco RPCs, colunas, trigger e protecao de e-mail como `true`, `anon_lista = false`, `authenticated_lista = true` e `escrita_direta_authenticated = false`.
5. Executar `VALIDATE_guest_contacts_seller_inbox_authorization_2026-09-14.sql` em staging. O script termina com `rollback` e nao preserva as alteracoes de leitura/arquivo usadas no teste.
6. Criar um contato de teste com vendedor elegivel e confirmar que painel e e-mail incluem os dados do visitante.
7. Criar um contato de teste com vendedor bloqueado e confirmar que e-mail, telefone e mensagem nao aparecem no e-mail nem nas RPCs.
8. Abrir o botao do e-mail e confirmar que a caixa seleciona diretamente o contato, inclusive a partir de um link antigo com `#/`.

## Regras preservadas

- Contato recebido enquanto o vendedor tinha plano elegivel permanece liberado.
- Contato recebido bloqueado e liberado por upgrade permanece liberado em downgrade futuro.
- Contato bloqueado nunca entrega dados pessoais ou mensagem por e-mail.
- O vendedor acessa somente seus proprios contatos pelas RPCs autenticadas.
- Nenhuma permissao direta de escrita na tabela e concedida ao vendedor.
- Contatos anteriores a primeira instalacao permanecem liberados somente quando existe job com evidencia de que a release anterior enfileirou seus dados para entrega.
- A migracao pode ser reexecutada sem bloquear contatos previamente liberados.

## Rollback

1. Restaurar o frontend anterior para remover o novo painel e seus deep links.
2. Restaurar e publicar a versao anterior de `sync-contact-notification-emails`.
3. Aplicar `ROLLBACK_add_guest_contacts_to_seller_inbox_stage1_2026-09-14.sql`.
4. Confirmar a consulta de verificacao no final do rollback.

Nunca aplicar o rollback SQL antes de restaurar a Edge Function: a versao nova consulta a coluna `content_locked`.
O rollback restaura `EXECUTE` para `authenticated` e `service_role` na funcao de refresh, mas nao reabre o acesso historico de `PUBLIC/anon`; essa diferenca e intencional e mais segura.
