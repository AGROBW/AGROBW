# Smoke test — `admin_login_completed`

**Etapa 6 do hotfix isolado.** Roda **depois** de aplicar o SQL e
publicar a Edge Function, e **antes** de publicar o site.

O que se verifica é a guarda que faltava: a ação afirma que o MFA foi
concluído, então precisa de **AAL2**. Com `isAdminProfile` sozinho, o
caso 1 passaria — é ele que justifica esta etapa existir.

> **Correção de um roteiro anterior.** A versão passada mandava usar
> `window.supabase`, que **não existe** — nem no código, nem no bundle. O
> cliente Supabase é um módulo importado, não uma global. O roteiro
> abaixo lê a sessão do `localStorage`, que é onde o supabase-js v2 a
> guarda, e **não imprime nem copia o token**.

---

## Preparação — o script de console

Cole isto no Console do DevTools, **na aba do site já logado**. Ele
define `chamar()` e não mostra o token em momento algum.

```js
// Lê a sessão do armazenamento do supabase-js v2, sem expor o token.
function _sessao() {
  const k = Object.keys(localStorage).find(x => /^sb-.*-auth-token$/.test(x));
  if (!k) throw new Error('Sessão não encontrada no localStorage. Está logado nesta aba?');
  const v = JSON.parse(localStorage.getItem(k));
  const t = v?.access_token || v?.currentSession?.access_token;
  if (!t) throw new Error('access_token ausente na sessão.');
  return t;
}

// Base64URL -> Base64, COM padding. Sem o padEnd, `atob` falha quando o
// payload nao tem comprimento multiplo de 4 — e ele frequentemente nao
// tem. E a mesma normalizacao usada na Edge Function.
function _b64urlJson(seg) {
  const n = seg.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(n.padEnd(Math.ceil(n.length / 4) * 4, '=')));
}

// Mostra SÓ as claims que interessam. Nunca o token.
function contexto() {
  const p = _b64urlJson(_sessao().split('.')[1]);
  return { aal: p.aal, role: p.role, session_id_presente: Boolean(p.session_id), exp: new Date(p.exp*1000).toISOString() };
}

// Faz a chamada e devolve status + corpo. O token só transita no header.
async function chamar(action = 'admin_login_completed') {
  const url = `${localStorage.getItem('_fnbase') || ''}/functions/v1/admin-security-event`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${_sessao()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action })
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}

// Duas chamadas REALMENTE concorrentes, disparadas antes de a 1ª concluir.
async function chamarConcorrente() {
  return Promise.all([chamar(), chamar()]);
}
```

Antes de usar, informe a base das funções **uma vez** — é a URL do
projeto, não é segredo:

```js
localStorage.setItem('_fnbase', 'https://<project-ref>.supabase.co');
contexto();   // confira o `aal` antes de cada caso
```

> `contexto()` devolve `aal`, `role`, se há `session_id` e a expiração.
> Nenhum desses é credencial. **Não** rode `_sessao()` sozinho no
> console: ele retorna o token.

Ao terminar: `localStorage.removeItem('_fnbase')`.

Contagem de referência, no SQL Editor:

```sql
select count(*) as antes
from public.security_events
where email = '<email-do-admin>'
  and attempted_action = 'admin_login_success'
  and created_at > now() - interval '10 minutes';
```

---

## Caso 1 — administrador com **AAL1** → 403, zero registros

Faça login como administrador e **pare antes do TOTP**. Confirme:

```js
contexto()      // aal deve ser 'aal1'
await chamar()  // esperado: { status: 403, ... }
```

```sql
-- não pode ter aumentado
select count(*) from public.security_events
where email = '<email-do-admin>' and attempted_action = 'admin_login_success'
  and created_at > now() - interval '10 minutes';

-- e a tentativa PRECISA ter deixado rastro
select severity, reason, created_at from public.security_events
where attempted_action = 'admin_login_completed_sem_aal2'
order by created_at desc limit 1;
```

**Esperado:** contagem inalterada; uma linha `critical`.

**Se retornar 200, PARE.** A guarda de AAL2 não está ativa.

---

## Caso 2 — administrador com **AAL2** → 200 e exatamente 1 registro

Conclua o TOTP. Confirme e chame:

```js
contexto()      // aal deve ser 'aal2'
await chamar()  // esperado: { status: 200, corpo: { success: true, audit: 'registrado' } }
```

**Esperado no banco:** `antes + 1`. Exatamente um — nem zero, nem dois.

Dois significaria gravação dupla (RPC **e** `logSecurityEvent`). Foi
assim na primeira versão; hoje só a RPC grava.

---

## Caso 3 — usuário comum autenticado → 403, zero registros

Em outra sessão/navegador, logado como usuário não administrador:

```js
await chamar()  // esperado: { status: 403, ... }
```

---

## Caso 4 — replay da MESMA sessão → converge

Repita o caso 2, mesma aba, mesma sessão:

```js
await chamar()  // esperado: { audit: 'ja_registrado' }
```

Contagem **continua** `antes + 1`.

---

## Caso 5 — duas chamadas concorrentes, em sessão **INÉDITA** ⭐

> **Correção de um roteiro anterior.** A versão passada mandava rodar a
> concorrência na mesma sessão dos casos 2 e 4 — que já estava
> registrada. As duas chamadas voltariam `ja_registrado`, e o teste
> passaria **sem provar nada**: a corrida nunca chegaria ao `INSERT`.
>
> A concorrência precisa de uma sessão que **ainda não registrou**.

Abra uma **janela anônima**, faça login como administrador e conclua o
TOTP. É a sessão B, inédita.

```js
contexto()                 // aal2, e nunca chamou
await chamarConcorrente()  // as duas disparadas antes de a 1ª concluir
```

**Esperado:** um `registrado` e um `ja_registrado`, em qualquer ordem, e
**exatamente um** `admin_login_success` a mais — contagem vai a
`antes + 2`.

Isso prova **duas** coisas de uma vez:

1. a corrida é fechada — duas chamadas simultâneas da mesma sessão
   produzem um registro só;
2. sessão diferente **é** registrada — a contagem subiu. É a diferença
   que a chave por sessão traz: a versão anterior, com janela de 120 s
   por e-mail, teria respondido `ja_registrado` e confundido um segundo
   login **real** com replay.

A garantia não está no Edge: está na `PRIMARY KEY` de
`admin_login_completed_keys`. A segunda transação bloqueia no índice até
a primeira confirmar, e então insere zero linhas.

> **Já validado localmente** no ambiente de homologação
> (`AGROBW-APP/homologacao/run_idempotencia_login.sh`, fora deste repo),
> com duas conexões reais, sessão inédita e `pg_sleep(1)` dentro do
> registro para alargar a janela:
>
> ```
> mesma sessao INEDITA, concorrentes .. registrado + ja_registrado
> outra sessao, mesmo instante ........ registrado
> replay serial ....................... ja_registrado
> 4 chamadas -> 2 registros, 2 chaves
> ```

### Se as duas voltarem `ja_registrado`

A sessão não era inédita. Refaça com um login novo — não é falha do
mecanismo, é o teste tendo rodado na ordem errada.

---

## Caso 6 — exclusão por titular remove as chaves

Verifica a justificativa de guardar `user_id`. No SQL Editor:

```sql
-- quantas chaves o titular tem
select count(*) from public.admin_login_completed_keys
where user_id = '<uuid-do-admin-de-teste>';

-- a FK e o índice existem?
select conname, confdeltype from pg_constraint
where conrelid = 'public.admin_login_completed_keys'::regclass and contype = 'f';
-- espera fk_admin_login_keys_user com confdeltype = 'c'

select indexname from pg_indexes
where schemaname='public' and tablename='admin_login_completed_keys';
-- espera ix_admin_login_keys_user
```

**Com a FK presente**, excluir a conta em `auth.users` remove as chaves
sozinho. **Sem ela** (a migração avisa no `NOTICE` se não pôde criá-la),
a remoção é manual e dirigida pelo índice:

```sql
delete from public.admin_login_completed_keys where user_id = '<uuid>';
```

Não teste a exclusão em conta real de produção.

---

## Caso 7 — formato do hash (SQL, não precisa de sessão)

Já coberto localmente, e repetível em homologação:

```sql
-- 64 caracteres NAO hexadecimais -> precisa falhar
select public.register_admin_login_completed(
  repeat('z', 64), '11111111-1111-1111-1111-111111111111', 'admin@teste.local');

-- 63 caracteres -> precisa falhar
select public.register_admin_login_completed(
  repeat('a', 63), '11111111-1111-1111-1111-111111111111', 'admin@teste.local');

-- maiusculas -> precisa falhar (o Edge produz minusculo)
select public.register_admin_login_completed(
  repeat('A', 64), '11111111-1111-1111-1111-111111111111', 'admin@teste.local');
```

**Esperado nos três:** `session_hash invalido: esperado SHA-256
hexadecimal minusculo de 64 caracteres`.

Validar só `length = 64` aceitaria os três primeiros — era o defeito.

---

## Caso 8 — falha parcial (opcional)

Se for possível fazer a RPC falhar num ambiente de teste — **nunca em
produção**:

**Esperado:** HTTP `207`, corpo `"audit":"falhou"`, e uma linha
`admin_login_audit_failed` severidade `critical`.

O login **não** é bloqueado. Mas a resposta não é sucesso limpo, e o
cliente registra `appWarn` em vez de tratar como auditoria concluída.

---

## Resultado

| Caso | Esperado | Obtido |
|---|---|---|
| 1 — AAL1 | 403, 0 registros, 1 `..._sem_aal2` critical | |
| 2 — AAL2 | 200 `registrado`, exatamente 1 | |
| 3 — usuário comum | 403, 0 registros | |
| 4 — replay mesma sessão | 200 `ja_registrado`, continua 1 | |
| 5 — **2 concorrentes, sessão inédita** | `registrado` + `ja_registrado`, 1 registro, contagem +1 | |
| 6 — exclusão por titular | FK `cascade` + índice presentes | |
| 7 — hash inválido (3 formas) | exceção nas três | |
| 8 — falha parcial (opcional) | 207 `falhou` + `admin_login_audit_failed` | |

**Os casos 1 a 7 precisam passar antes do deploy do site.** Se qualquer
um falhar, o site não vai ao ar: o cliente antigo continua chamando a RPC
direto, que segue funcionando, e nada quebra enquanto a Edge Function é
corrigida.
