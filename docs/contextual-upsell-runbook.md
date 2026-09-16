# Upsell contextual

## Objetivo

Oferecer uma solucao apenas quando ela resolve uma necessidade observavel do usuario. A implementacao nao muda planos, precos, limites ou regras de acesso existentes.

## Etapas implementadas

1. Fundacao: configuracao protegida, eventos sem dados pessoais, atribuicao e metricas.
2. Recomendacao: motor deterministico escolhe o menor plano que resolve o contexto.
3. Experiencia: cards contextuais em limite de anuncios e leads protegidos, com cooldown.
4. Recuperacao: fila interna criada somente apos inicio explicito de checkout, sem qualquer envio.

## Ordem segura de publicacao

1. Revisar o diff e os SQLs com um segundo revisor.
2. Em staging, confirmar o bypass de RLS com a consulta abaixo. Exigir `rolbypassrls = true` para `postgres` e `service_role` antes de aplicar `sql/create_contextual_upsell_2026-09-16.sql` em janela de baixo trafego.

```sql
select rolname, rolbypassrls
from pg_roles
where rolname in ('postgres', 'service_role')
order by rolname;
```
3. Executar `sql/validate_contextual_upsell_2026-09-16.sql` e exigir todos os campos `true`.
4. Executar `sql/validate_contextual_upsell_behavior_2026-09-16.sql` e exigir `Success. No rows returned`.
5. Publicar o frontend em staging e adicionar somente contas internas como usuarios piloto.
6. Habilitar apenas `ad_limit`, testar checkout sandbox, retorno do pagamento, conversao unica, cooldown e fila convertida.
7. Repetir com `lead_locked` usando uma conta em downgrade e confirmar que plano pago nao recebe oferta indevida.
8. Publicar `purge-contextual-upsell-data` com `verify_jwt=false`, configurar `CONTEXTUAL_UPSELL_CRON_SECRET` e agendar um `POST` diario com o mesmo segredo em `x-cron-secret`.
9. Em producao, aplicar a mesma sequencia mantendo chave global, recuperacao, contextos e pilotos vazios.
10. Adicionar um piloto interno, liberar um contexto por vez e acompanhar as metricas antes de ampliar.
11. Ativar a chave global somente depois da validacao do piloto e da confirmacao do agendador de retencao. A recuperacao continua sem consumidor externo nesta entrega.

## Criterios de liberacao

- A migration completa termina sem erro e pode ser reaplicada sem alterar o resultado.
- O validador estrutural retorna uma unica linha com todos os campos `true`.
- O validador comportamental retorna `Success. No rows returned` e reverte todas as alteracoes de teste.
- Um checkout sandbox gera exatamente um `checkout_started`, uma conversao e uma fila `converted`, mesmo com reenvio do webhook.
- Uma nova compra do mesmo plano, com outra sessao de checkout, gera uma nova conversao sem duplicar replays da compra anterior.
- Um plano oculto, inativo ou de downgrade nunca aparece como recomendacao.
- O endpoint de retencao rejeita chamadas sem o segredo e o agendador diario foi confirmado no ambiente.
- A funcionalidade permanece invisivel fora dos usuarios piloto ate a aprovacao expressa da liberacao global.

## Retencao programada

O endpoint interno `purge-contextual-upsell-data` deve ser chamado uma vez por dia. Ele nao aceita chamadas de navegador, exige `CONTEXTUAL_UPSELL_CRON_SECRET` e usa a `service_role` apenas para executar `public.purge_contextual_upsell_data()`. Sem esse agendamento, nao ative a chave global.

O registro de `checkout_started` espera no maximo 800 ms antes do redirecionamento. Em rede excepcionalmente lenta, a telemetria pode ser perdida, mas o checkout continua normalmente e nenhuma compra e bloqueada.

## Rollback

Primeiro desligue o agendador que chama `purge-contextual-upsell-data`. Depois desligue a chave global, a recuperacao, os contextos e os usuarios piloto. Isso oculta a interface imediatamente sem remover dados. Se a atribuicao apresentar falhas, execute `sql/emergency_disable_contextual_upsell_attribution.sql`; ele remove apenas a RPC de atribuicao e desativa a experiencia. O webhook trata a ausencia dessa RPC como telemetria nao bloqueante. Para remocao integral, execute `sql/rollback_contextual_upsell_2026-09-16.sql` somente depois de confirmar que nao ha investigacao de metricas em andamento. Remova ou despublique a Edge Function de retencao depois que o agendador estiver desativado.

## Garantias desta entrega

- Funcionalidade desligada por padrao.
- Nenhum envio por WhatsApp, e-mail ou push.
- Nenhum e-mail, telefone ou mensagem na fila de recuperacao.
- Acesso direto as tabelas negado para `anon` e `authenticated`.
- Administracao protegida por `public.is_admin()` e auditoria.
- Telemetria com cooldown e limite por usuario.
- Retencao disponivel apenas para `service_role`.
