# Hotfix isolado — login administrativo

**Nada aplicado, nada publicado, nada commitado.**

Entrega **mínima**, separada da regra de planos. Existe vulnerabilidade
ativa, e ela não deve esperar o deploy dos planos.

---

## A vulnerabilidade

Estado **medido em produção** em 2026-09-09, pela pré-verificação:

| role | `register_admin_login_attempt(text,boolean,text,text)` |
|---|---|
| `PUBLIC` | sem EXECUTE |
| `anon` | sem EXECUTE |
| **`authenticated`** | **TEM EXECUTE** ← a exposição |
| `service_role` | TEM EXECUTE ← legítimo, precisa continuar |

Ela alimenta o **rate limit** do login administrativo. Chamar com
`p_success = true` e o e-mail de um administrador insere
`admin_login_success` em `security_events` e **reabre a janela de
tentativas daquele administrador**.

**Qualquer usuário autenticado** — um cliente comum, sem papel
administrativo nenhum — zera o bloqueio por força bruta de qualquer
admin, quantas vezes quiser. É escalada de privilégio a partir de uma
conta comum.

**Não é alcançável sem sessão.** `anon` não tem EXECUTE. O quanto isso
reduz a gravidade depende da política de cadastro: se abrir conta é
self-service, a barreira é baixa. Essa leitura é sua, não deste
documento.

Não é auditoria forjada. É bypass de rate limit.

> **Os arquivos do repositório estão errados sobre isto.**
> `sql/create_admin_login_rate_limit.sql:163` e o dump
> `02_schema.sql:22173` dizem que `anon` tem o grant. Produção diz que
> não — alguém revogou depois, e nenhum dos dois foi atualizado. Este
> documento afirmou o mesmo até a medição. A pré-verificação é a fonte;
> os arquivos versionados, não.

---

## O worktree limpo

`C:\BWAGRO` tem 20 entradas modificadas/não rastreadas do usuário —
`NewsArticleView`, `AnnouncementsMonitoring`, `generate-news-article`,
SQLs novos, `rateLimit`, e os arquivos da regra de planos. **Nada disso
foi tocado**: sem `stash`, sem `reset`, sem `commit`.

```bash
git worktree add -b hotfix/login-admin-rate-limit C:\BWAGRO-hotfix HEAD
```

Worktree em `C:\BWAGRO-hotfix`, a partir de `3add6c4`. Copiei nele
**somente** os três arquivos de segurança:

```
 M pages/AdminMfaView.tsx
 M src/hooks/useSecurityLog.ts
 M supabase/functions/admin-security-event/index.ts
```

### A entrega é AUTOCONTIDA

Correção: antes, o código estava no worktree e o SQL/runbook em
`C:\AGROBW-APP` — outro repositório. Aplicar SQL de arquivo solto e não
versionado é justamente o que não se deve fazer.

A migração e os documentos foram para `sql/` **do próprio worktree**, que
já é onde este projeto guarda migrações (`sql/create_admin_login_rate_limit.sql`
está lá):

```
 M pages/AdminMfaView.tsx
 M src/hooks/useSecurityLog.ts
 M supabase/functions/admin-security-event/index.ts
?? sql/hotfix_login_admin_rate_limit_2026-09-08.sql
?? sql/RUNBOOK_hotfix_login_admin_rate_limit.md
?? sql/SMOKE_hotfix_login_admin_rate_limit.md
```

Seis arquivos, um commit, nada fora dele. Nenhum hook de plano, banner,
dashboard ou métrica.

### Commits planejados

Um só, no branch `hotfix/login-admin-rate-limit`:

> **Correção posterior.** A mensagem abaixo é a do commit `8359716`, tal
> como foi gravada, e diz "concedida a anon e authenticated". A medição
> em produção mostrou que `anon` **não** tem o grant. O commit não é
> reescrito; a correção vive nos commits seguintes e neste documento.

```
fix(seguranca): fechar bypass de rate limit no login administrativo

register_admin_login_attempt esta concedida a anon e authenticated.
Ela alimenta o rate limit do login admin: gravar success=true para o
e-mail de um administrador reabre a janela de tentativas dele.

- admin-security-event: acao admin_login_completed exigindo AAL2,
  idempotencia por sessao garantida no banco, falha parcial em HTTP 207
- AdminMfaView: deixa de chamar a RPC direto; le o campo audit
- useSecurityLog: log_unauthorized_access no lugar de log_security_event;
  remove getClientIP e a chamada a api.ipify.org
- sql/: migracao, runbook e roteiro de smoke

Revogacao das RPCs antigas fica para a etapa 9 do runbook, depois da
verificacao do bundle publicado.
```

Se preferir dois commits, a divisão natural é `sql/` primeiro (a
migração é pré-requisito do deploy da Edge Function) e o código depois,
com o segundo citando o hash do primeiro. Um só é mais simples de
reverter, e é o que recomendo.

---

## O mecanismo idempotente atômico

### Por que o anterior não servia

A idempotência estava no Edge, em check-then-insert:

```
SELECT em security_events  ->  se não achou, chama a RPC
```

Duas requisições simultâneas passam as duas pelo `SELECT` antes de
qualquer `INSERT`, e gravam as duas. Não era garantia, era corrida.

E a chave era `e-mail + janela de 120 s`, que confunde **replay** com um
**segundo login real**: dois logins genuínos no mesmo minuto, de sessões
diferentes, viravam um só registro.

### O que passou a ser

A chave é a **sessão**, e a unicidade é do **banco**.

```
session_id do JWT já verificado
   -> SHA-256 hexadecimal (64 chars), calculado no Edge
      -> PRIMARY KEY de public.admin_login_completed_keys
```

`sql/hotfix_login_admin_rate_limit_2026-09-08.sql` cria a tabela e a RPC
`register_admin_login_completed(session_hash, user_id, email, user_agent)`
— o `email` é **parâmetro de passagem**, repassado a
`register_admin_login_attempt`, e **não** é gravado na tabela:

```sql
insert into admin_login_completed_keys (...) values (...)
on conflict (session_hash) do nothing;

if not found then
  return 'ja_registrado';          -- replay: converge
end if;

perform register_admin_login_attempt(...);   -- só a primeira chega aqui
return 'registrado';
```

Sob duas transações simultâneas com a mesma chave, a segunda **bloqueia
no índice** até a primeira confirmar, e então insere zero linhas. A
garantia é do PostgreSQL, não do Edge.

### Sobre o hash — o token nunca é armazenado

- `session_id` é identificador de sessão, **não** credencial de acesso;
- o access token não é enviado ao banco nem gravado;
- algoritmo: **SHA-256, hexadecimal minúsculo, 64 caracteres**, via
  `crypto.subtle.digest` no Edge. O banco recebe só o hash;
- guardar o hash em vez do `session_id` evita que a tabela vire um índice
  de sessões ativas;
- validação de **formato**, não só de comprimento: o banco recusa
  qualquer coisa fora de `^[0-9a-f]{64}$`. Testado com 64 não-hex, 63
  caracteres e 64 maiúsculas — os três recusados;
- a FK é criada **direta**, sem `exception when others`. A versão
  anterior degradava a falha para `NOTICE`: a migração diria "aplicada",
  a garantia de exclusão não existiria, e ninguém saberia. Se a FK não
  puder ser criada, a transação **inteira aborta** — melhor não aplicar
  do que aplicar sem a garantia.

### Minimização de dados

A tabela guarda **três** colunas, e só:

| Coluna | Por quê |
|---|---|
| `session_hash` | a chave; é só ela que decide replay |
| `user_id` | **não** participa da idempotência. Existe para exclusão por titular, e a justificativa se sustenta em duas coisas que a migração cria **obrigatoriamente**: o índice `ix_admin_login_keys_user` e a FK `on delete cascade` para `auth.users(id)` |
| `registrado_em` | base da limpeza por idade |

**`email` foi removido.** Não tinha uso operacional: a idempotência usa
`session_hash`, e o registro que interessa — com e-mail, IP, user agent e
motivo — já fica em `security_events`. Guardá-lo aqui seria duplicar
identificador sem ganho.

### Retenção: **manual**, e é isso que o banco faz

Correção de uma afirmação minha anterior: **não existe retenção
automática de 90 dias**. `limpar_admin_login_keys(dias)` apenas existe;
nada a executa sozinho.

Não criei agendamento porque isso exige confirmar, em produção, que
`pg_cron` está instalado e qual é o padrão de agendamento do projeto — e
não tenho essa confirmação. Criar `cron.schedule` no escuro pode falhar
na migração ou duplicar um agendador existente.

Execução manual, por `service_role`:

```sql
select public.limpar_admin_login_keys(90);
```

O volume não pressiona: uma linha por sessão administrativa concluída,
alguns registros por dia. A limpeza é higiene, não necessidade
operacional. Se `pg_cron` for confirmado, o snippet de agendamento está
comentado no rodapé do SQL.

### Aplicação parcial: **aborta e exige inspeção**

`create table if not exists` é silencioso: uma execução interrompida, ou
uma tabela criada com outro formato, passaria batido.

A versão anterior tentava "validar o schema inteiro" quando os objetos já
existiam. Mas schema inteiro é mais do que nomes de coluna — é tipo,
ordem, `PRIMARY KEY` na coluna certa, índices, FK, RLS, políticas.
Conferir parte disso e anunciar "schema validado" dá uma confiança que a
checagem não sustenta.

**Regra atual, mais simples e mais segura:** se **qualquer** objeto da
migração já existir, ela **aborta** e nomeia o que encontrou. Aplicação
parcial é evento raro e sério; substituir automaticamente o que sobrou de
uma execução interrompida é como se perde dado sem perceber.

**Consequência assumida: a migração não é reexecutável.** Para reaplicar,
o operador inspeciona, decide e limpa à mão — o roteiro está no rodapé do
SQL, e ele pede para entender de onde vieram as linhas antes de apagar,
porque cada uma é um login administrativo já registrado.

### Concorrência real, validada

### Concorrência real, validada

`homologacao/run_idempotencia_login.sh` — duas conexões de verdade, com
`pg_sleep(1)` dentro do registro para alargar a janela da corrida:

```
CASO A  mesma sessao, duas chamadas CONCORRENTES
        retorno 1: registrado
        retorno 2: ja_registrado
CASO B  OUTRA sessao, mesmo instante ......... registrado
CASO C  replay serial da sessao A ............ ja_registrado

IDEM-1 OK   2 registros no total: 1 por SESSAO, nao 1 por chamada
IDEM-2 OK   2 chaves idempotentes gravadas
IDEM-3 OK   4 chamadas produziram 2 registro(s)
IDEMPOTENCIA ATOMICA: PASSOU
```

Sem a garantia do índice, as duas chamadas do caso A gravariam — é
exatamente o que o `pg_sleep` força.

---

## O diff — **sete** arquivos

Três modificados e quatro novos. A entrega é autocontida: código,
migração, runbook e roteiro de smoke no mesmo commit.

```
 M pages/AdminMfaView.tsx                            |  44 ++++--
 M src/hooks/useSecurityLog.ts                       | 172 +++++-----------
 M supabase/functions/admin-security-event/index.ts  | 133 ++++++++++++-
   3 modificados: 197 insercoes, 152 remocoes

?? sql/hotfix_login_admin_rate_limit_2026-09-08.sql   a migracao
?? sql/RUNBOOK_hotfix_login_admin_rate_limit.md       este documento
?? sql/SMOKE_hotfix_login_admin_rate_limit.md         o roteiro de smoke
?? sql/PREVERIFICACAO_hotfix_login_admin_rate_limit.sql  a pre-verificacao READ ONLY
```

### `supabase/functions/admin-security-event/index.ts`

- ação `admin_login_completed`, na união de tipos e em `ALLOWED_ACTIONS`;
- **AAL2 obrigatório** — `isAdminAal2Profile(profile, token)`.
  `isAdminProfile` sozinho aceitaria token AAL1, e confiar que a chamada
  veio da tela de MFA não é validação. Sem AAL2: registra
  `admin_login_completed_sem_aal2` severidade `critical` e responde
  **403**;
- `lerSessionId(token)` lê o `session_id` do payload de um JWT **já
  verificado** por `getUser`; `sha256Hex` produz a chave;
- **uma** chamada, à RPC transacional. Sem `SELECT` prévio;
- **falha parcial**: registra `admin_login_audit_failed` severidade
  `critical` e responde **HTTP 207** com `audit: 'falhou'`;
- as quatro ações antigas seguem idênticas — por isso a Edge Function
  nova é compatível com o site em produção hoje.

### `pages/AdminMfaView.tsx`

- `finalizeCompletedAdminLogin` invoca `admin-security-event` em vez da
  RPC. O e-mail deixa de ser enviado pelo cliente;
- **lê o campo `audit`**: `falhou` ou erro de invoke viram `appWarn`;
- o login **não** é bloqueado — `Promise.allSettled`, sem `throw`.
  Recusar acesso a um administrador por falha de registro seria pior que
  a falha.

### `src/hooks/useSecurityLog.ts` — 221 → 111 linhas

- `logUnauthorizedAccess` chama `log_unauthorized_access(rota, motivo)`;
  identidade vem da sessão, no servidor;
- `logSecurityEvent` **removido** do hook — conferido: sem consumidor;
- `getClientIP` **removido**, e com ele `api.ipify.org`, que enviava o IP
  do usuário a um terceiro a cada acesso não autorizado;
- o IP deixa de ser registrado (a RPC grava nulo). Para tê-lo com origem
  confiável seria preciso registrar por Edge Function — anotado, não
  feito.

---

## Validação no worktree limpo

```
typecheck   22 erros (idêntico ao baseline) | nos meus arquivos: 0
build       3931 modules transformed, built in 12.38s, exit 0

bundle      log_security_event ............... 0
            register_admin_login_attempt ..... 0
            api.ipify.org .................... 0
            log_unauthorized_access .......... 1
            admin_login_completed ............ 1
            register_admin_login_completed ... 0   (só o Edge a chama)
```

Os 22 erros de tipo são pré-existentes, em arquivos que o hotfix não
toca. `vite build` não roda `tsc` — não bloqueiam publicação e não vieram
daqui.

---

## Ordem do hotfix isolado

```
0. pre-verificacao READ ONLY em producao .......... sql/PREVERIFICACAO_hotfix_login_admin_rate_limit.sql
1. worktree limpo ................................. FEITO
2. aplicar so os 3 patches de seguranca ........... FEITO
3. build + typecheck no worktree .................. FEITO
4. aplicar sql/hotfix_login_admin_rate_limit_2026-09-08.sql
     (tabela + RPC; o bloco 4 de REVOGACAO fica fora)
5. publicar admin-security-event
6. smoke  AAL1 / AAL2 / nao-admin / replay CONCORRENTE
7. publicar o site do worktree limpo
8. verificar o bundle publicado
9. revogar as RPCs antigas de authenticated (anon ja esta sem)
10. pos-verificacao de permissoes e do fluxo
```

**4 antes de 5:** a Edge Function nova chama
`register_admin_login_completed`. Publicá-la antes da RPC existir faria o
registro cair em `audit: 'falhou'` — não quebraria o login, mas perderia
auditoria à toa.

**5 antes de 7:** o site novo contra a Edge Function antiga receberia
`"Evento invalido."` (400), e o registro de login administrativo pararia
de existir na janela entre os deploys.

**9 depois de 8:** revogar antes de o bundle publicado ter deixado de
chamar quebra produção. A conferência de bundle é a prova, não
formalidade.

### Etapa 0 — pré-verificação, antes de qualquer coisa

`sql/PREVERIFICACAO_hotfix_login_admin_rate_limit.sql`, colado inteiro no
SQL Editor. Abre em `read only` e termina em `rollback`: não cria, não
altera, não revoga.

Responde de uma vez: os pré-requisitos existem, nenhum objeto do hotfix
existe ainda, e quem tem `EXECUTE` na RPC antiga hoje. **Salve a saída do
bloco 3** — é ela que produz o rollback da etapa 9. Reconceder de memória
é como se devolve permissão a mais.

Qualquer `ATENCAO` no bloco 2 significa aplicação anterior: a migração
vai abortar sozinha, e está certa em abortar. Não force.

> A primeira versão deste arquivo consultava `security_events.event_type`
> — um nome que eu supus em vez de conferir no DDL. Morreu em produção
> com `42703: column ... does not exist`. A coluna é `attempted_action`.
> A verificação agora confere a COLUNA antes de usá-la: se o schema mudar
> de novo, sai uma linha `[NAO VERIFICADO]` e o resto do relatório
> continua saindo, em vez de o relatório inteiro morrer.

### Etapa 4 — SQL

Aplicar `sql/hotfix_login_admin_rate_limit_2026-09-08.sql` **até o `commit` da
seção 3**. O bloco 4 (revogações) está comentado de propósito e só entra
na etapa 9.

Pré e pós-verificação específicas da migração estão no rodapé do arquivo.

### Etapa 6 — smoke

`sql/SMOKE_hotfix_login_admin_rate_limit.md`, sete casos:

| Caso | Esperado |
|---|---|
| AAL1 | **403**, 0 registros, `..._sem_aal2` critical |
| AAL2 | **200** `registrado`, exatamente **1** |
| usuário comum | **403**, 0 registros |
| replay mesma sessão | **200** `ja_registrado`, continua 1 |
| **2 chamadas concorrentes** | uma `registrado`, outra `ja_registrado`, **1** registro |
| **outra sessão, mesmo minuto** | **200** `registrado`, sobe para +2 |
| falha parcial (opcional) | **207** `falhou` + `admin_login_audit_failed` |

Os dois em negrito são os que a versão anterior não passaria.

### Etapa 9 — revogação

Bloco 4 de `sql/hotfix_login_admin_rate_limit_2026-09-08.sql`. A pré-verificação
produz o rollback: salve a saída antes.

O que a revogação de fato muda, pelo estado medido:

| comando | efeito real hoje |
|---|---|
| `revoke ... from authenticated` | **é este que fecha a vulnerabilidade** |
| `revoke ... from anon` | **no-op** — `anon` já está sem EXECUTE |
| `revoke ... from public` | **no-op** — `PUBLIC` já está sem EXECUTE |
| `grant execute ... to service_role` | mantém o login público funcionando |

Os dois no-op **ficam de propósito**. `revoke` de quem não tem permissão
não dá erro, e eles são a defesa preventiva: se um deploy futuro
reconceder `anon` por engano — como os arquivos versionados sugeririam a
quem os lesse — este bloco desfaz. Custo zero, e cobre a reincidência.

**`log_security_event` ainda não foi medida.** Ela entrou na
pré-verificação depois da primeira execução. Rode a versão atual antes
desta etapa: sem a medida, o rollback dela é chute — e foi exatamente
assim que a linha de `anon` entrou errada aqui.

`admin-login/index.ts:155` chama `register_admin_login_attempt` para quem
**ainda não tem sessão**, com `service_role` — continua funcionando. Em
nenhuma hipótese reconceder a `anon`.

`get_admin_login_rate_limit_status(text)` **não** é revogada: o
formulário de login precisa dela antes de haver sessão, e ela só lê.

---

## Rollback — a ordem importa, e é mais longa do que eu havia escrito

Correção: restaurar **só o site** não basta. A Edge Function nova chama
`register_admin_login_completed`; se a RPC for removida antes de ela
voltar à versão anterior, **todo login administrativo cai em
`audit: 'falhou'`**.

Ordem completa, de trás para frente:

```
1. republicar o SITE anterior
     -> volta a chamar register_admin_login_attempt direto
2. republicar a EDGE FUNCTION anterior
     -> para de depender da RPC nova.  SEM ESTE PASSO, o passo 4 quebra
        a auditoria de todo login
3. reconceder os EXECUTE que a pre-verificacao registrou
     -> register_admin_login_attempt e log_security_event
4. so ENTAO derrubar a RPC nova, a funcao de limpeza e a tabela
```

Por etapa:

| Etapa desfeita | Como |
|---|---|
| 9 revogações | reconceder **exatamente** o que a pré-verificação mostrou como `true` — hoje isso é `authenticated` e nada mais. **Nunca** a `anon`: ela não tem, e reconceder ampliaria a superfície em vez de restaurá-la |
| 7 site | redeploy do build anterior |
| 5 Edge Function | redeploy da versão anterior; sem estado a desfazer |
| 4 SQL | `drop` da RPC, da função de limpeza e da tabela — **por último** |

**Validado localmente** (caso E do teste):

```
ROLLBACK-1 OK   EXECUTE reconcedido a authenticated
ROLLBACK-2 OK   RPC e tabela removidas
ROLLBACK-3 OK   funcao pre-existente intacta e funcional apos o rollback
```

O ROLLBACK-3 é o que importa: depois de derrubar tudo o que o hotfix
criou, `register_admin_login_attempt` continua existindo e gravando. O
hotfix só **acrescenta** e, na etapa 9, **revoga** — não substitui corpo
nenhum, então não há definição antiga a restaurar.

Para descartar o worktree:

```bash
git worktree remove C:\BWAGRO-hotfix
git branch -D hotfix/login-admin-rate-limit
```

---

## O que este hotfix NÃO contém

Regra de planos, `PendingPaymentBanner`, `UserDashboardView`, hooks de
assinatura, métrica financeira, migração de cancelamento, Etapa 3 do
histórico. Tudo isso segue em `C:\BWAGRO` e em
`sql/ORDEM_FINAL_IMPLANTACAO.md`, sem alteração.
