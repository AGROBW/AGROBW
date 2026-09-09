-- =====================================================================
-- PÓS-VERIFICAÇÃO — hotfix_login_admin_rate_limit_2026-09-08.sql
-- =====================================================================
-- Rodar DEPOIS da etapa 4 (migração aplicada) e ANTES da etapa 5
-- (publicar a Edge Function).
--
-- SOMENTE LEITURA. Abre em `read only` e termina em `rollback`: não
-- cria, não altera, não revoga, não apaga. Se qualquer linha tentasse
-- escrever, o Postgres abortaria com
--   ERROR: cannot execute ... in a read-only transaction
--
-- Onde: Supabase Studio -> SQL Editor, projeto dockpbyzrvgewgdoaibn.
-- Cole o arquivo INTEIRO. O resultado sai em UMA tabela, porque o SQL
-- Editor mostra só o último result set.
--
-- Colunas: bloco / item / encontrado / esperado / situacao.
-- Procure por ATENCAO. As linhas `informativo` viram INFO e não têm
-- valor "certo" — são registro.
--
-- `Success. No rows returned` na aplicação NÃO é prova de nada: a
-- migração termina em `commit` e não devolve linhas mesmo quando dá
-- certo. Quem prova é esta consulta.
-- =====================================================================

begin;
set transaction read only;

with

-- ---------------------------------------------------------------------
-- alvos
-- ---------------------------------------------------------------------
tab as (
  select to_regclass('public.admin_login_completed_keys') as oid
),

-- As DUAS funções criadas pela migração.
novas(rotulo, oid) as (
  values
    ('register_admin_login_completed(text,uuid,text,text)',
     to_regprocedure('public.register_admin_login_completed(text, uuid, text, text)')::oid),
    ('limpar_admin_login_keys(integer)',
     to_regprocedure('public.limpar_admin_login_keys(integer)')::oid)
),

-- As DUAS RPCs pré-existentes que a etapa 9 vai revogar. O bloco 4 da
-- migração está COMENTADO, então nada aqui pode ter mudado.
antigas(rotulo, oid, baseline_public, baseline_anon, baseline_auth, baseline_srv) as (
  values
    -- baseline medido em produção pela pré-verificação, 2026-09-09
    ('register_admin_login_attempt(text,boolean,text,text)',
     to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid,
     'sem EXECUTE', 'sem EXECUTE', 'TEM EXECUTE', 'TEM EXECUTE'),
    -- SEM baseline: esta função só entrou na pré-verificação DEPOIS da
    -- execução dela. Não há com o que comparar; aqui ela é registrada
    -- para servir de baseline da etapa 9.
    ('log_security_event(uuid,text,...,jsonb)',
     to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid,
     null, null, null, null)
),

-- ---------------------------------------------------------------------
-- 1 — a tabela
-- ---------------------------------------------------------------------
-- Tudo aqui lê o CATÁLOGO (`pg_attribute`, `pg_class`, `pg_policy`), não
-- a tabela. Catálogo responde normalmente quando o objeto não existe, e
-- por isso este bloco sobrevive à tabela ausente e reporta o fato.
--
-- A contagem de linhas, que precisa tocar a tabela de verdade, fica
-- separada logo abaixo — pelo motivo explicado lá.
b1(bloco, item, encontrado, esperado) as (
  select '1) TABELA', x.item, x.encontrado, x.esperado
  from tab t
  cross join lateral (values
    ('existe',
     coalesce(t.oid::text, '(AUSENTE)'),
     'admin_login_completed_keys'),

    ('colunas, em ordem (nome:tipo)',
     coalesce(
       (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod),
                          ', ' order by a.attnum)
          from pg_attribute a
         where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
       '(sem colunas)'),
     'session_hash:text, user_id:uuid, registrado_em:timestamp with time zone'),

    ('quantidade de colunas',
     coalesce(
       (select count(*)::text from pg_attribute a
         where a.attrelid = t.oid and a.attnum > 0 and not a.attisdropped),
       '0'),
     '3'),

    -- minimizacao de dados: `email` foi retirado de proposito
    ('coluna email (NAO deve existir)',
     case when exists (
            select 1 from pg_attribute a
             where a.attrelid = t.oid and a.attname = 'email'
               and a.attnum > 0 and not a.attisdropped)
          then 'PRESENTE' else 'ausente' end,
     'ausente'),

    ('RLS habilitada',
     coalesce((select case when c.relrowsecurity then 'sim' else 'NAO' end
                 from pg_class c where c.oid = t.oid), '(tabela ausente)'),
     'sim'),

    -- RLS ligada e ZERO politicas = ninguem passa, exceto owner e
    -- quem tem BYPASSRLS. E o desenho: so `service_role` chega aqui,
    -- e pela RPC SECURITY DEFINER, nunca direto.
    ('politicas RLS',
     coalesce((select count(*)::text from pg_policy p where p.polrelid = t.oid), '0'),
     '0'),

    ('privilegios de tabela para anon',
     case when t.oid is null then '(tabela ausente)'
          when has_table_privilege('anon', t.oid, 'SELECT, INSERT, UPDATE, DELETE')
            then 'TEM ALGUM' else 'nenhum' end,
     'nenhum'),

    ('privilegios de tabela para authenticated',
     case when t.oid is null then '(tabela ausente)'
          when has_table_privilege('authenticated', t.oid, 'SELECT, INSERT, UPDATE, DELETE')
            then 'TEM ALGUM' else 'nenhum' end,
     'nenhum')
  ) x(item, encontrado, esperado)
),

-- A CONTAGEM FICA SEPARADA, e o motivo importa.
--
-- `query_to_xml` adia a resolução do nome para a execução, mas não a
-- dispensa: se a tabela não existir, ele estoura na hora de rodar. Posto
-- dentro do `values` acima, ele executaria SEMPRE — e o relatório
-- inteiro morria quando a tabela faltava, que é justo o caso em que ele
-- precisa falar. Foi assim que esta consulta falhou no teste N8.
--
-- Um `case when t.oid is null then ... else query_to_xml(...) end` NÃO
-- resolve: o argumento é uma constante, e o planejador pode avaliar a
-- expressão antes do `case`. O guard tem que estar no WHERE, que é
-- avaliado antes da lista de seleção.
b1_linhas(bloco, item, encontrado, esperado) as (
  select
    '1) TABELA',
    'linhas (a Edge Function ainda NAO foi publicada)',
    coalesce(
      nullif((xpath('/row/c/text()',
                    query_to_xml('select count(*) as c from public.admin_login_completed_keys',
                                 false, true, '')))[1]::text, ''),
      '0'),
    '0'
  from tab t
  where t.oid is not null
),

b1_linhas_ausente(bloco, item, encontrado, esperado) as (
  select
    '1) TABELA',
    'linhas (a Edge Function ainda NAO foi publicada)',
    '(tabela ausente — nao contado)',
    '0'
  from tab t
  where t.oid is null
),

-- ---------------------------------------------------------------------
-- 2 — chave primária e índices
-- ---------------------------------------------------------------------
-- A PK NÃO é formalidade: é ela que dá o exatamente-uma-vez sob
-- concorrência. `on conflict do nothing` sem índice único não bloqueia
-- nada, e duas requisições simultâneas da mesma sessão gravariam as
-- duas. Se esta linha der ATENCAO, a idempotência não existe.
b2(bloco, item, encontrado, esperado) as (
  select '2) CHAVE E INDICES', x.item, x.encontrado, x.esperado
  from tab t
  cross join lateral (values
    ('PRIMARY KEY, e em qual coluna',
     coalesce(
       (select 'PK (' || string_agg(a.attname, ', ' order by k.ord) || ')'
          from pg_constraint c
          cross join lateral unnest(c.conkey) with ordinality as k(num, ord)
          join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.num
         where c.conrelid = t.oid and c.contype = 'p'
         group by c.oid),
       '(SEM PRIMARY KEY)'),
     'PK (session_hash)'),

    ('indice ix_admin_login_keys_tempo',
     coalesce(to_regclass('public.ix_admin_login_keys_tempo')::text, '(AUSENTE)'),
     'ix_admin_login_keys_tempo'),

    ('indice ix_admin_login_keys_user',
     coalesce(to_regclass('public.ix_admin_login_keys_user')::text, '(AUSENTE)'),
     'ix_admin_login_keys_user')
  ) x(item, encontrado, esperado)
),

-- ---------------------------------------------------------------------
-- 3 — a FK que sustenta a justificativa de `user_id`
-- ---------------------------------------------------------------------
-- `user_id` não participa da idempotência. Ele existe para exclusão por
-- titular, e essa justificativa só se sustenta com ÍNDICE + FK
-- `on delete cascade`. Sem o cascade, apagar a conta deixaria as chaves
-- para trás e a remoção dependeria de alguém lembrar de rodar um
-- `delete`. Por isso `confdeltype` é verificado, não só a existência.
b3(bloco, item, encontrado, esperado) as (
  select '3) FK PARA auth.users', x.item, x.encontrado, x.esperado
  from tab t
  left join pg_constraint c
         on c.conrelid = t.oid
        and c.contype = 'f'
        and c.conname = 'fk_admin_login_keys_user'
  cross join lateral (values
    ('constraint fk_admin_login_keys_user',
     coalesce(c.conname, '(AUSENTE)'),
     'fk_admin_login_keys_user'),

    ('tabela e coluna referenciadas',
     coalesce(
       c.confrelid::regclass::text || '(' ||
       (select string_agg(a.attname, ', ' order by k.ord)
          from unnest(c.confkey) with ordinality as k(num, ord)
          join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.num)
       || ')',
       '(AUSENTE)'),
     'auth.users(id)'),

    ('acao ON DELETE',
     case c.confdeltype
       when 'c' then 'cascade'
       when 'a' then 'no action'
       when 'r' then 'restrict'
       when 'n' then 'set null'
       when 'd' then 'set default'
       else '(AUSENTE)'
     end,
     'cascade')
  ) x(item, encontrado, esperado)
),

-- ---------------------------------------------------------------------
-- 4 — as duas funções novas
-- ---------------------------------------------------------------------
-- SECURITY DEFINER sem `search_path` fixado é sequestrável: quem chama
-- controla o resolvedor de nomes e pode fazer a função enxergar objetos
-- de outro schema. Por isso `search_path` é verificado junto, não
-- separado — um sem o outro não vale.
--
-- E `anon`/`authenticated` NÃO podem ter EXECUTE nestas funções. Elas
-- gravam auditoria com os poderes do dono; só o servidor chama.
b4(bloco, item, encontrado, esperado) as (
  select '4) FUNCOES NOVAS', n.rotulo || '  ->  ' || x.item, x.encontrado, x.esperado
  from novas n
  left join pg_proc p on p.oid = n.oid
  cross join lateral (values
    ('existe',
     case when n.oid is null then '(AUSENTE)' else 'existe' end,
     'existe'),

    ('seguranca',
     case when n.oid is null then '(AUSENTE)'
          when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
     'SECURITY DEFINER'),

    ('search_path fixado',
     case when n.oid is null then '(AUSENTE)'
          else coalesce(array_to_string(p.proconfig, ' ; '), '(NAO FIXADO)') end,
     'search_path=public, pg_temp'),

    ('EXECUTE para PUBLIC',
     case when n.oid is null then '(AUSENTE)'
          -- proacl NULL nao e "vazio": e o DEFAULT, e o default de
          -- funcao no Postgres e EXECUTE para PUBLIC.
          when p.proacl is null then 'TEM (proacl NULL = default)'
          when exists (select 1 from aclexplode(p.proacl) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE')
            then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     'sem EXECUTE'),

    ('EXECUTE para anon',
     case when n.oid is null then '(AUSENTE)'
          when has_function_privilege('anon', n.oid, 'EXECUTE') then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     'sem EXECUTE'),

    ('EXECUTE para authenticated',
     case when n.oid is null then '(AUSENTE)'
          when has_function_privilege('authenticated', n.oid, 'EXECUTE') then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     'sem EXECUTE'),

    ('EXECUTE para service_role',
     case when n.oid is null then '(AUSENTE)'
          when has_function_privilege('service_role', n.oid, 'EXECUTE') then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     'TEM EXECUTE')
  ) x(item, encontrado, esperado)
),

-- ---------------------------------------------------------------------
-- 5 — as RPCs antigas NÃO podem ter mudado
-- ---------------------------------------------------------------------
-- O bloco 4 da migração (revogações) está COMENTADO e só entra na
-- etapa 9. Se alguma linha aqui der ATENCAO, ou o bloco foi
-- descomentado por engano, ou alguém mexeu em permissões por fora — nos
-- dois casos, PARE antes de publicar a Edge Function.
--
-- `service_role` precisa continuar com EXECUTE em
-- register_admin_login_attempt: `admin-login/index.ts:155` a chama para
-- quem AINDA NÃO TEM SESSÃO. Perder isso quebra o login público.
b5(bloco, item, encontrado, esperado) as (
  select '5) RPCs ANTIGAS (nada podia mudar)',
         a.rotulo || '  ->  ' || x.item,
         x.encontrado,
         -- baseline NULL = sem medida anterior; vira registro, nao teste
         coalesce(x.esperado, 'informativo')
  from antigas a
  cross join lateral (values
    ('EXECUTE para PUBLIC',
     case when a.oid is null then '(rpc AUSENTE)'
          when (select p.proacl from pg_proc p where p.oid = a.oid) is null
            then 'TEM (proacl NULL = default)'
          when exists (select 1 from pg_proc p, aclexplode(p.proacl) x2
                        where p.oid = a.oid and x2.grantee = 0
                          and x2.privilege_type = 'EXECUTE')
            then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     a.baseline_public),

    ('EXECUTE para anon',
     case when a.oid is null then '(rpc AUSENTE)'
          when has_function_privilege('anon', a.oid, 'EXECUTE') then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     a.baseline_anon),

    ('EXECUTE para authenticated',
     case when a.oid is null then '(rpc AUSENTE)'
          when has_function_privilege('authenticated', a.oid, 'EXECUTE') then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     a.baseline_auth),

    ('EXECUTE para service_role',
     case when a.oid is null then '(rpc AUSENTE)'
          when has_function_privilege('service_role', a.oid, 'EXECUTE') then 'TEM EXECUTE'
          else 'sem EXECUTE' end,
     a.baseline_srv)
  ) x(item, encontrado, esperado)
),

linhas as (
  select * from b1
  union all select * from b1_linhas
  union all select * from b1_linhas_ausente
  union all select * from b2
  union all select * from b3
  union all select * from b4
  union all select * from b5
)

select
  l.bloco,
  l.item,
  l.encontrado,
  l.esperado,
  case
    when l.esperado = 'informativo' then 'INFO'
    when l.encontrado = l.esperado  then 'OK'
    else 'ATENCAO'
  end as situacao
from linhas l
order by l.bloco, l.item;

rollback;

-- =====================================================================
-- COMO LER
-- =====================================================================
-- Liberado para a etapa 5 (publicar a Edge Function) quando TODAS as
-- linhas estiverem OK ou INFO. Qualquer ATENCAO para antes.
--
-- Onde cada falha dói:
--
--   bloco 1  colunas/RLS  -> se `email` aparecer, a minimizacao de dados
--            nao foi aplicada. Se RLS estiver desligada, a tabela fica
--            legivel por quem tiver privilegio de tabela.
--
--            `linhas` != 0 e surpreendente AQUI: a Edge Function que
--            escreve nessa tabela ainda NAO foi publicada. Qualquer
--            valor diferente de 0 quer dizer que algo mais gravou —
--            investigue antes de seguir, nao ignore.
--
--   bloco 2  PK           -> ESTA e a idempotencia. Sem o indice unico,
--            `on conflict do nothing` nao bloqueia nada e duas chamadas
--            simultaneas da mesma sessao gravariam as duas. ATENCAO aqui
--            significa que a garantia central do hotfix nao existe.
--
--   bloco 3  FK cascade   -> sem `cascade`, apagar a conta deixa as
--            chaves orfas e a exclusao por titular vira manual. E a
--            unica justificativa para `user_id` estar na tabela.
--
--   bloco 4  EXECUTE      -> `anon` ou `authenticated` com EXECUTE em
--            register_admin_login_completed seria uma vulnerabilidade
--            NOVA, criada por este hotfix: a funcao grava auditoria com
--            os poderes do dono.
--
--   bloco 5  RPCs antigas -> o bloco 4 da migracao esta comentado. Se
--            algo mudou, ou ele rodou por engano, ou alguem mexeu por
--            fora. Nos dois casos, PARE.
--
-- SOBRE log_security_event: as linhas dela saem como INFO, nao OK/
-- ATENCAO, porque NAO HA BASELINE — ela entrou na pre-verificacao
-- depois que a pre-verificacao ja tinha sido executada. Esta saida e a
-- primeira medida dela. ANOTE-A: e ela que vai servir de baseline para
-- o rollback da etapa 9. Reconceder por memoria, ou pelo que os
-- arquivos do repositorio dizem, foi exatamente o erro que colocou
-- `anon` errado na documentacao deste hotfix.
--
-- PROXIMO PASSO: etapa 5, publicar `admin-security-event`. A ordem
-- importa — a Edge Function nova chama `register_admin_login_completed`,
-- que so agora existe.
-- =====================================================================
