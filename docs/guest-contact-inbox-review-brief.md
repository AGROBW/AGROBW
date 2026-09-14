# Revisao independente - contatos visitantes na caixa do vendedor

## Objetivo

Validar a implementacao que permite ao vendedor visualizar no painel os contatos enviados por visitantes sem conta, sem transformar visitantes em usuarios ou chats artificiais.

## Invariantes de seguranca

1. Apenas o vendedor autenticado pode listar, abrir, marcar como lido ou arquivar seus contatos.
2. `anon` nao executa as RPCs da caixa do vendedor.
3. O frontend nao recebe dados pessoais nem mensagem quando `is_locked = true`.
4. O processador de e-mail funciona em modo fail-closed: erro de consulta, contato ausente ou data invalida ocultam o conteudo.
5. Contatos recebidos com plano elegivel permanecem liberados.
6. Contatos bloqueados e posteriormente liberados por upgrade permanecem liberados em downgrade futuro.
7. Nenhuma permissao direta de escrita na tabela de contatos e concedida ao vendedor.
8. Contatos visitantes nunca habilitam resposta interna, proposta comercial ou inteligencia logistica.
9. Contatos existentes na primeira instalacao permanecem liberados somente com evidencia de que a release anterior enfileirou seus dados para entrega.
10. Reexecutar a migracao nao volta a bloquear contatos liberados anteriormente.

## Fluxos funcionais

1. Um contato visitante novo aparece em `Recebidas`, com selo `Visitante sem conta` e contador nao lido.
2. Ao abrir, o contato e marcado como lido e o contador global diminui.
3. Um contato liberado mostra nome, e-mail, telefone opcional e mensagem completa.
4. Um contato bloqueado mostra somente a chamada de upgrade, sem dados pessoais.
5. O link de e-mail `?guest=<uuid>` abre a aba e seleciona o contato correspondente.
6. Arquivar remove o contato da caixa ativa.
7. A visao `Arquivados` lista somente contatos visitantes arquivados.
8. Restaurar devolve o contato para a caixa ativa.
9. Chats entre usuarios continuam permitindo mensagens, propostas e recursos de logistica sem regressao.
10. Links antigos com `#/minha-conta/mensagens` sao convertidos antes do primeiro render para a rota atual.
11. A listagem de visitantes so e consultada dentro da tela de mensagens e o polling pausa com a aba oculta.
12. A funcao interna de refresh pode ser executada diretamente apenas por `service_role`; o rollback restaura somente `authenticated` e `service_role`, sem reabrir `PUBLIC/anon`.

## Arquivos centrais

- `sql/add_guest_contacts_to_seller_inbox_stage1_2026-09-14.sql`
- `sql/ROLLBACK_add_guest_contacts_to_seller_inbox_stage1_2026-09-14.sql`
- `sql/VALIDATE_guest_contacts_seller_inbox_authorization_2026-09-14.sql`
- `supabase/functions/sync-contact-notification-emails/index.ts`
- `supabase/functions/sync-contact-notification-emails/template.ts`
- `src/hooks/useGuestAnnouncementContact.ts`
- `src/hooks/useMessages.ts`
- `src/hooks/useNotificationsCount.ts`
- `src/lib/guestContactInbox.ts`
- `components/MessagesView.tsx`

## Verificacoes automatizadas

```powershell
npm test -- --run
npm run build
npx tsc --noEmit --pretty false
git diff --check
```

O `tsc` global deve ser comparado com a linha de base, pois o repositorio possui erros preexistentes fora deste escopo. Nenhum erro novo deve apontar para os arquivos centrais acima.

## Ordem de implantacao

1. Aplicar a migracao SQL.
2. Publicar `sync-contact-notification-emails`.
3. Publicar o frontend.
4. Executar o validador SQL transacional em staging com contatos de dois vendedores.
5. Executar os fluxos funcionais com um vendedor elegivel e outro bloqueado.
