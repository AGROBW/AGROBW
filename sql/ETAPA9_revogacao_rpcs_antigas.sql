-- =====================================================================
-- ETAPA 9 — revogação das RPCs antigas
-- =====================================================================
-- **APLICADO EM PRODUÇÃO em 2026-09-09** (projeto dockpbyzrvgewgdoaibn).
--
-- Validado depois da execução, pelo smoke de produção:
--   chaves 3 -> 4 · sucessos 118 -> 119 · falhas 0 -> 0
--
-- Ou seja: o login administrativo continuou registrando normalmente
-- DEPOIS de `authenticated` perder o EXECUTE — que é exatamente o que
-- precisava acontecer. O registro passou a vir só pela Edge Function
-- com `service_role`, e nenhuma falha apareceu.
--
-- O SQL abaixo é o que foi executado, sem alteração. Este arquivo fica
-- versionado como registro do que rodou, não como algo a rodar de novo:
-- reexecutar aborta no portão 2/4, porque o baseline mudou — e essa
-- recusa é o comportamento correto.
--
-- Foi esta etapa que fechou a vulnerabilidade. Tudo antes dela —
-- migração, Edge Function, site — era preparação: enquanto
-- `authenticated` pudesse executar `register_admin_login_attempt`,
-- qualquer usuário logado reabria a janela de rate limit de qualquer
-- administrador.
--
-- PRÉ-REQUISITOS JÁ CUMPRIDOS (não repetir):
--   · migração aplicada, pós-verificação 41 OK / 1 INFO / 0 ATENCAO;
--   · Edge Function `admin-security-event` na versão 6;
--   · site publicado em `dpl_22gu6McqUBpvDUtfqJQkTnV4J4oR`, com os cinco
--     marcadores conferidos sobre os 137 arquivos servidos por
--     agrobw.com.br: log_security_event 0, register_admin_login_attempt 0,
--     api.ipify.org 0, log_unauthorized_access 1, admin_login_completed 1;
--   · smoke de produção casos 1-4 aprovado (chaves 2->3, sucessos
--     117->118, falhas 0->0).
--
-- A ORDEM IMPORTA e já foi respeitada: revogar antes de o bundle
-- publicado ter parado de chamar quebraria produção. Ele parou.
--
-- Transação ÚNICA. Qualquer verificação que falhe aborta tudo — não
-- existe revogação pela metade.
--
-- Onde rodar: Supabase Studio -> SQL Editor, projeto dockpbyzrvgewgdoaibn.
-- Cole o arquivo INTEIRO.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. EXISTÊNCIA — as três funções precisam estar lá
-- ---------------------------------------------------------------------
-- As duas antigas, porque são o alvo. E o wrapper
-- `log_unauthorized_access(text,text)`, porque é ele que o site passou a
-- usar no lugar de `log_security_event`: se ele não existir, revogar as
-- outras deixa o cliente sem NENHUM caminho de registro.
do $$
declare
  v_faltando text[] := array[]::text[];
begin
  if to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)') is null then
    v_faltando := v_faltando || 'register_admin_login_attempt(text,boolean,text,text)'::text;
  end if;
  if to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)') is null then
    v_faltando := v_faltando || 'log_security_event(uuid,text,text,text,text,text,text,text,jsonb)'::text;
  end if;
  if to_regprocedure('public.log_unauthorized_access(text, text)') is null then
    v_faltando := v_faltando || 'log_unauthorized_access(text,text) [wrapper que o site usa]'::text;
  end if;

  if array_length(v_faltando, 1) > 0 then
    raise exception E'ABORTADO — funcao(oes) esperada(s) NAO existe(m):\n  %\n\n'
      'Assinatura diferente da esperada tambem cai aqui. Confira antes de '
      'insistir: revogar sobre um schema que nao e o previsto e pior que '
      'nao revogar.',
      array_to_string(v_faltando, E'\n  ');
  end if;

  raise notice '1/4 existencia ok — as tres funcoes estao presentes';
end $$;

-- ---------------------------------------------------------------------
-- 2. BASELINE — o estado de partida tem que ser EXATAMENTE o medido
-- ---------------------------------------------------------------------
-- Medido em produção pela pré-verificação, 2026-09-09, nas duas RPCs:
--
--   PUBLIC ......... sem EXECUTE
--   anon ........... sem EXECUTE
--   authenticated .. TEM EXECUTE   <- o que sai daqui
--   service_role ... TEM EXECUTE   <- o que fica
--
-- Se o estado atual divergir disso, alguma coisa mudou desde a medição —
-- e o rollback documentado deixa de valer, porque ele reconcede com base
-- nesse baseline. Melhor abortar e remedir.
--
-- PUBLIC é lido direto na ACL, com `grantee = 0`:
-- `has_function_privilege('public', ...)` estoura, PUBLIC não é role de
-- verdade. E `proacl` NULL não é "vazio": é o DEFAULT do Postgres, que
-- para função é EXECUTE para PUBLIC. Ler NULL como ausência inverteria a
-- conclusão justamente no caso mais perigoso.
do $$
declare
  r record;
  v_public boolean;
  v_erros text[] := array[]::text[];
begin
  for r in
    select x.rotulo, x.oid
    from (values
      ('register_admin_login_attempt(text,boolean,text,text)',
       to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid),
      ('log_security_event(uuid,text,...,jsonb)',
       to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid)
    ) x(rotulo, oid)
  loop
    select case
             when p.proacl is null then true
             else exists (select 1 from aclexplode(p.proacl) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
           end
      into v_public
      from pg_proc p where p.oid = r.oid;

    if v_public then
      v_erros := v_erros || (r.rotulo || ': PUBLIC TEM EXECUTE (esperado: sem)')::text;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      v_erros := v_erros || (r.rotulo || ': anon TEM EXECUTE (esperado: sem)')::text;
    end if;
    if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      v_erros := v_erros || (r.rotulo || ': authenticated SEM EXECUTE (esperado: tem)')::text;
    end if;
    if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      v_erros := v_erros || (r.rotulo || ': service_role SEM EXECUTE (esperado: tem)')::text;
    end if;
  end loop;

  if array_length(v_erros, 1) > 0 then
    raise exception E'ABORTADO — o estado atual NAO e o baseline medido em 2026-09-09:\n  %\n\n'
      'Algo mudou desde a medicao. O rollback documentado assume esse '
      'baseline; aplicar por cima dele deixaria a volta errada. Remeça com '
      'sql/PREVERIFICACAO_hotfix_login_admin_rate_limit.sql antes de seguir.',
      array_to_string(v_erros, E'\n  ');
  end if;

  raise notice '2/4 baseline ok — authenticated e service_role com EXECUTE; anon e PUBLIC sem';
end $$;

-- ---------------------------------------------------------------------
-- 3. O CAMINHO QUE FICA — `log_unauthorized_access` precisa sobreviver
-- ---------------------------------------------------------------------
-- Depois desta etapa, é por aqui que o navegador registra acesso não
-- autorizado. Duas coisas precisam valer, e a segunda é sutil:
--
--   a) `authenticated` pode EXECUTAR o wrapper;
--   b) o wrapper é SECURITY DEFINER e seu DONO mantém EXECUTE em
--      `log_security_event`.
--
-- (b) é o que impede a revogação de quebrar o wrapper por dentro. Ele
-- chama `public.log_security_event(...)` no corpo. Sendo SECURITY
-- DEFINER com dono `postgres`, a chamada interna roda com os poderes do
-- dono, e a revogação de `authenticated` não a alcança.
--
-- Se alguém no futuro trocar o wrapper para SECURITY INVOKER, a chamada
-- interna passa a rodar como quem chamou — e o registro de acesso não
-- autorizado quebra em silêncio, para todo usuário logado. Por isso a
-- checagem está aqui, e não numa nota de rodapé.
do $$
declare
  v_oid_wrapper oid := to_regprocedure('public.log_unauthorized_access(text, text)')::oid;
  v_oid_lse     oid := to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid;
  v_secdef      boolean;
  v_dono        name;
  v_erros       text[] := array[]::text[];
begin
  if not has_function_privilege('authenticated', v_oid_wrapper, 'EXECUTE') then
    v_erros := v_erros || 'authenticated NAO pode executar log_unauthorized_access(text,text)'::text;
  end if;

  select p.prosecdef, pg_get_userbyid(p.proowner)
    into v_secdef, v_dono
    from pg_proc p where p.oid = v_oid_wrapper;

  if not v_secdef then
    v_erros := v_erros ||
      ('log_unauthorized_access e SECURITY INVOKER. Ela chama log_security_event '
       || 'por dentro: revogar de authenticated quebraria o registro de acesso '
       || 'nao autorizado para todo usuario logado.')::text;
  elsif not has_function_privilege(v_dono, v_oid_lse, 'EXECUTE') then
    v_erros := v_erros ||
      ('o dono de log_unauthorized_access (' || v_dono || ') nao tem EXECUTE em '
       || 'log_security_event; a chamada interna falharia.')::text;
  end if;

  if array_length(v_erros, 1) > 0 then
    raise exception E'ABORTADO — o caminho que deve SOBREVIVER a revogacao esta quebrado:\n  %',
      array_to_string(v_erros, E'\n  ');
  end if;

  raise notice '3/4 wrapper ok — SECURITY DEFINER, dono %, e authenticated pode executa-lo', v_dono;
end $$;

-- ---------------------------------------------------------------------
-- 4. AS REVOGAÇÕES
-- ---------------------------------------------------------------------
-- `revoke` de quem não tem permissão não dá erro. PUBLIC e anon já estão
-- sem EXECUTE (baseline), então essas quatro linhas são NO-OP hoje —
-- ficam como defesa preventiva, porque os arquivos versionados do
-- repositório ainda sugerem que anon deveria ter o grant, e alguém
-- poderia reconceder de boa-fé num deploy futuro.
--
-- Quem de fato muda é `authenticated`.

-- 4a. register_admin_login_attempt — a vulnerabilidade ativa
revoke all on function public.register_admin_login_attempt(text, boolean, text, text) from public;        -- no-op hoje
revoke all on function public.register_admin_login_attempt(text, boolean, text, text) from anon;          -- no-op hoje
revoke all on function public.register_admin_login_attempt(text, boolean, text, text) from authenticated; -- <- o efetivo
grant execute on function public.register_admin_login_attempt(text, boolean, text, text) to service_role;

-- 4b. log_security_event
revoke all on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) from public;        -- no-op hoje
revoke all on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) from anon;          -- no-op hoje
revoke all on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) from authenticated; -- <- o efetivo
grant execute on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) to service_role;

-- O `grant` a service_role é explícito de propósito. Ele já tinha o
-- EXECUTE (baseline), então normalmente é redundante — mas escrever é
-- barato, e garante que um `revoke all` mais amplo no futuro não o leve
-- junto sem ninguém perceber.
--
-- `admin-login/index.ts:155` chama register_admin_login_attempt com
-- service_role, para quem AINDA NAO TEM SESSAO. É o login público. Sem
-- este grant, ele para.

-- ---------------------------------------------------------------------
-- 5. PÓS-CONDIÇÃO — antes do commit, e dentro da mesma transação
-- ---------------------------------------------------------------------
-- Se qualquer linha aqui falhar, a transação inteira volta atrás e
-- NADA foi revogado. É o ponto do arquivo: ou o estado final é o
-- desejado, ou não houve mudança nenhuma.
--
-- `has_function_privilege` já leva em conta herança de role e o grant a
-- PUBLIC — então ele pega inclusive o caso de `authenticated` continuar
-- com acesso por um caminho indireto que as revogações não cobriram.
do $$
declare
  r record;
  v_public boolean;
  v_erros text[] := array[]::text[];
begin
  for r in
    select x.rotulo, x.oid
    from (values
      ('register_admin_login_attempt(text,boolean,text,text)',
       to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid),
      ('log_security_event(uuid,text,...,jsonb)',
       to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid)
    ) x(rotulo, oid)
  loop
    select case
             when p.proacl is null then true
             else exists (select 1 from aclexplode(p.proacl) a
                           where a.grantee = 0 and a.privilege_type = 'EXECUTE')
           end
      into v_public
      from pg_proc p where p.oid = r.oid;

    if v_public then
      v_erros := v_erros || (r.rotulo || ': PUBLIC AINDA tem EXECUTE')::text;
    end if;
    if has_function_privilege('anon', r.oid, 'EXECUTE') then
      v_erros := v_erros || (r.rotulo || ': anon AINDA tem EXECUTE')::text;
    end if;
    if has_function_privilege('authenticated', r.oid, 'EXECUTE') then
      v_erros := v_erros || (r.rotulo || ': authenticated AINDA tem EXECUTE — a revogacao NAO surtiu efeito')::text;
    end if;
    if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
      v_erros := v_erros || (r.rotulo || ': service_role PERDEU o EXECUTE — o login publico pararia')::text;
    end if;
  end loop;

  -- e o caminho que fica, de novo, agora que a revogacao ja aconteceu
  if not has_function_privilege('authenticated',
       to_regprocedure('public.log_unauthorized_access(text, text)')::oid, 'EXECUTE') then
    v_erros := v_erros || 'authenticated perdeu EXECUTE em log_unauthorized_access(text,text)'::text;
  end if;

  if array_length(v_erros, 1) > 0 then
    raise exception E'ABORTADO NA POS-CONDICAO — nada foi revogado:\n  %',
      array_to_string(v_erros, E'\n  ');
  end if;

  raise notice '4/4 pos-condicao ok — antigas fechadas para o cliente, abertas para service_role';
end $$;

commit;

-- ---------------------------------------------------------------------
-- 6. TABELA DE CONFERÊNCIA — **DEPOIS** do commit, de propósito
-- ---------------------------------------------------------------------
-- Ela vinha antes do `commit;` numa versão anterior. Não dava erro, mas
-- num SQL Editor que mostra apenas o ÚLTIMO result set, o `commit`
-- posterior engolia a tabela — e ficar sem a conferência é ficar sem
-- saber o que foi aplicado.
--
-- Agora ela roda FORA da transação, e por isso mostra o estado **já
-- confirmado**: o que está gravado no banco, não o que estava proposto.
--
-- Isso não afrouxa nada. Quem decide se o commit acontece são os quatro
-- portões acima, todos DENTRO da transação — em especial a pós-condição
-- (4/4), que aborta e desfaz tudo se o estado final não for o desejado.
-- Esta consulta não valida: ela relata. Se ela imprimiu, o commit passou.
--
-- Guarde esta saída — é o baseline do rollback.
select
  f.rotulo                                as funcao,
  case when p.proacl is null then 'TEM (proacl NULL = default)'
       when exists (select 1 from aclexplode(p.proacl) a
                     where a.grantee = 0 and a.privilege_type = 'EXECUTE')
         then 'TEM EXECUTE' else 'sem EXECUTE' end  as "PUBLIC",
  case when has_function_privilege('anon', f.oid, 'EXECUTE')
         then 'TEM EXECUTE' else 'sem EXECUTE' end  as anon,
  case when has_function_privilege('authenticated', f.oid, 'EXECUTE')
         then 'TEM EXECUTE' else 'sem EXECUTE' end  as authenticated,
  case when has_function_privilege('service_role', f.oid, 'EXECUTE')
         then 'TEM EXECUTE' else 'sem EXECUTE' end  as service_role,
  pg_get_userbyid(p.proowner)             as dono,
  case when p.prosecdef then 'DEFINER' else 'INVOKER' end as seguranca,
  coalesce(p.proacl::text, '(NULL = default)')            as proacl
from (values
  ('register_admin_login_attempt(text,boolean,text,text)  [REVOGADA]',
   to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid, 1),
  ('log_security_event(uuid,text,...,jsonb)  [REVOGADA]',
   to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid, 2),
  ('log_unauthorized_access(text,text)  [PRESERVADA]',
   to_regprocedure('public.log_unauthorized_access(text, text)')::oid, 3)
) f(rotulo, oid, ordem)
join pg_proc p on p.oid = f.oid
order by f.ordem;

-- =====================================================================
-- ESPERADO NA TABELA
-- =====================================================================
--   register_admin_login_attempt  PUBLIC sem · anon sem · authenticated sem · service_role TEM
--   log_security_event            PUBLIC sem · anon sem · authenticated sem · service_role TEM
--   log_unauthorized_access       authenticated TEM  <- o caminho que fica
--
-- Qualquer coisa diferente disso não deveria ter chegado ao commit: a
-- pós-condição aborta antes. Se chegou, algo muito estranho aconteceu —
-- pare e investigue.
-- =====================================================================


-- =====================================================================
-- ROLLBACK — bloco SEPARADO, não executar junto
-- =====================================================================
-- Rodar só se algo quebrar depois da revogação.
--
-- Reconcede EXCLUSIVAMENTE `authenticated`, porque é o único que tinha
-- EXECUTE no baseline de 2026-09-09.
--
-- NUNCA reconceder `anon` nem `PUBLIC`. Eles NÃO tinham a permissão —
-- concedê-los "para voltar ao normal" deixaria produção MAIS exposta do
-- que antes de todo este hotfix. Rollback que amplia superfície não é
-- rollback. Uma versão anterior desta documentação errava exatamente
-- aqui, dizendo para reconceder anon.
--
-- begin;
--   grant execute on function public.register_admin_login_attempt(text, boolean, text, text)
--     to authenticated;
--   grant execute on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)
--     to authenticated;
--
--   -- Confirme, ainda DENTRO da transacao, que a volta devolveu
--   -- exatamente o baseline: authenticated e service_role com EXECUTE,
--   -- anon e PUBLIC sem. Se qualquer linha falhar, o rollback inteiro
--   -- e desfeito e nenhum grant persiste.
--   --
--   -- PUBLIC e lido direto na ACL, por `grantee = 0`. Uma versao
--   -- anterior deste bloco prometia conferir PUBLIC e so conferia anon:
--   -- se `proacl` fosse NULL, PUBLIC teria EXECUTE pelo DEFAULT do
--   -- Postgres e a guarda deixaria passar -- justamente o caso mais
--   -- perigoso, e o que a promessa dizia cobrir.
--   do $$
--   declare
--     r record;
--     v_public boolean;
--     v_erros text[] := array[]::text[];
--   begin
--     for r in
--       select x.rotulo, x.oid
--       from (values
--         ('register_admin_login_attempt(text,boolean,text,text)',
--          to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid),
--         ('log_security_event(uuid,text,...,jsonb)',
--          to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid)
--       ) x(rotulo, oid)
--     loop
--       select case
--                when p.proacl is null then true   -- default = EXECUTE p/ PUBLIC
--                else exists (select 1 from aclexplode(p.proacl) a
--                              where a.grantee = 0 and a.privilege_type = 'EXECUTE')
--              end
--         into v_public
--         from pg_proc p where p.oid = r.oid;
--
--       if v_public then
--         v_erros := v_erros || (r.rotulo || ': PUBLIC ficou com EXECUTE')::text;
--       end if;
--       if has_function_privilege('anon', r.oid, 'EXECUTE') then
--         v_erros := v_erros || (r.rotulo || ': anon ficou com EXECUTE')::text;
--       end if;
--       if not has_function_privilege('authenticated', r.oid, 'EXECUTE') then
--         v_erros := v_erros || (r.rotulo || ': authenticated NAO recuperou o EXECUTE')::text;
--       end if;
--       if not has_function_privilege('service_role', r.oid, 'EXECUTE') then
--         v_erros := v_erros || (r.rotulo || ': service_role perdeu o EXECUTE')::text;
--       end if;
--     end loop;
--
--     if array_length(v_erros, 1) > 0 then
--       raise exception E'ROLLBACK ABORTADO — estado final incorreto:\n  %',
--         array_to_string(v_erros, E'\n  ');
--     end if;
--
--     raise notice 'rollback ok — authenticated e service_role com EXECUTE; anon e PUBLIC sem';
--   end $$;
-- commit;
--
-- -- conferencia, DEPOIS do commit, pelo mesmo motivo da tabela acima:
-- select r.nome,
--   case when has_function_privilege(r.nome, to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid, 'EXECUTE')
--        then 'TEM EXECUTE' else 'sem EXECUTE' end as register_admin_login_attempt,
--   case when has_function_privilege(r.nome, to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid, 'EXECUTE')
--        then 'TEM EXECUTE' else 'sem EXECUTE' end as log_security_event
-- from (values ('anon'), ('authenticated'), ('service_role')) r(nome);
--
-- ANTES de rodar o rollback, entenda o que quebrou. Reconceder
-- `authenticated` reabre a vulnerabilidade: qualquer usuario logado
-- volta a poder zerar o rate limit de qualquer administrador. Só faz
-- sentido como medida temporária, enquanto a causa real é corrigida.
-- =====================================================================
