-- =====================================================================
-- PRÉ-VERIFICAÇÃO — hotfix_login_admin_rate_limit_2026-09-08.sql
-- =====================================================================
-- SOMENTE LEITURA. Não cria, não altera, não revoga, não apaga nada.
--
-- Onde rodar: Supabase Studio -> SQL Editor, projeto dockpbyzrvgewgdoaibn.
-- Cole o arquivo INTEIRO e execute de uma vez.
--
-- A transação é aberta em READ ONLY: se qualquer linha aqui tentasse
-- escrever, o próprio Postgres abortaria com
--   ERROR: cannot execute ... in a read-only transaction
-- E termina em ROLLBACK, não COMMIT — nada persiste, nem por engano.
--
-- O resultado sai em UMA tabela só, porque o SQL Editor mostra apenas o
-- último result set. Colunas: bloco / item / encontrado / esperado /
-- situacao. Procure por ATENCAO.
-- =====================================================================

begin;
set transaction read only;

with

-- As DUAS funções que o bloco 4 da migração revoga na etapa 9.
-- `oid` NULL quando não existe.
--
-- log_security_event entrou aqui porque a etapa 9 a revoga, e o rollback
-- precisa reconceder EXATAMENTE o que existia. Medir só uma das duas
-- deixaria metade do rollback baseada no dump — que já se mostrou
-- errado sobre `anon`.
alvo(rotulo, rpc_oid) as (
  values
    ('register_admin_login_attempt(text,boolean,text,text)',
     to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::oid),
    ('log_security_event(uuid,text,text,text,text,text,text,text,jsonb)',
     to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)')::oid)
),

-- ---------------------------------------------------------------------
-- 1 e 2 — existência dos objetos
-- ---------------------------------------------------------------------
-- `to_regclass` / `to_regprocedure` devolvem NULL em vez de estourar
-- quando o objeto não existe: é o jeito seguro de perguntar.
--
-- Para as funções NOVAS a busca é por NOME, em qualquer schema e
-- qualquer assinatura. Procurar só pela assinatura exata deixaria passar
-- uma versão anterior com outros argumentos — que é justamente o caso
-- que a pré-condição da migração precisa pegar.
existencia(bloco, item, encontrado, esperado) as (
  values
    ('1) PRE-REQUISITOS (devem EXISTIR)',
     'rpc  register_admin_login_attempt(text,boolean,text,text)',
     to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')::text,
     'EXISTIR'),

    ('1) PRE-REQUISITOS (devem EXISTIR)',
     'tab  public.security_events',
     to_regclass('public.security_events')::text,
     'EXISTIR'),

    ('1) PRE-REQUISITOS (devem EXISTIR)',
     'tab  auth.users  (alvo da FK on delete cascade)',
     to_regclass('auth.users')::text,
     'EXISTIR'),

    ('2) OBJETOS DO HOTFIX (NAO podem existir)',
     'tab  public.admin_login_completed_keys',
     to_regclass('public.admin_login_completed_keys')::text,
     'AUSENTE'),

    ('2) OBJETOS DO HOTFIX (NAO podem existir)',
     'rpc  register_admin_login_completed  [qualquer schema/assinatura]',
     (select string_agg(p.oid::regprocedure::text, '  |  ' order by p.oid)
        from pg_proc p
       where p.proname = 'register_admin_login_completed'),
     'AUSENTE'),

    ('2) OBJETOS DO HOTFIX (NAO podem existir)',
     'rpc  limpar_admin_login_keys  [qualquer schema/assinatura]',
     (select string_agg(p.oid::regprocedure::text, '  |  ' order by p.oid)
        from pg_proc p
       where p.proname = 'limpar_admin_login_keys'),
     'AUSENTE'),

    ('2) OBJETOS DO HOTFIX (NAO podem existir)',
     'idx  ix_admin_login_keys_user',
     to_regclass('public.ix_admin_login_keys_user')::text,
     'AUSENTE'),

    ('2) OBJETOS DO HOTFIX (NAO podem existir)',
     'idx  ix_admin_login_keys_tempo',
     to_regclass('public.ix_admin_login_keys_tempo')::text,
     'AUSENTE'),

    ('2) OBJETOS DO HOTFIX (NAO podem existir)',
     'fk   fk_admin_login_keys_user',
     (select c.conname from pg_constraint c
       where c.conname = 'fk_admin_login_keys_user'),
     'AUSENTE')
),

-- ---------------------------------------------------------------------
-- 2b — rastro de execução anterior, mesmo que os objetos já tenham sido
--      derrubados
-- ---------------------------------------------------------------------
-- Objeto ausente não prova que o hotfix nunca rodou: alguém pode ter
-- aplicado e feito rollback. Os `attempted_action` que SÓ a Edge
-- Function nova emite são a prova independente.
--
-- A coluna é `attempted_action`. Uma versão anterior deste arquivo dizia
-- `event_type` — um nome que eu supus em vez de conferir — e a consulta
-- morreu em produção com `42703: column s.event_type does not exist`.
-- O DDL real de `public.security_events` é:
--   id uuid | user_id uuid | email text | attempted_route text NOT NULL
--   attempted_action text | ip_address inet | user_agent text
--   severity public.severity_level | reason text | metadata jsonb
--   created_at timestamptz
--
-- Por que `query_to_xml` e não um SELECT direto na tabela: o Postgres
-- resolve os nomes na ANÁLISE, antes de qualquer WHERE. Escrito direto,
-- um `from public.security_events` guardado por `where to_regclass(...)
-- is not null` NÃO seria poupado — se a tabela faltasse, a consulta
-- inteira morreria com "relation does not exist" e você não receberia
-- relatório nenhum, justo no cenário em que ele mais importa.
-- `query_to_xml` adia a resolução para a execução, e o guard no WHERE
-- impede que ela chegue a rodar. Continua sendo leitura pura.
--
-- O guard agora confere a COLUNA, não só a tabela. É exatamente a falha
-- de hoje: o nome errado de coluna derrubava o relatório inteiro. Agora
-- ele vira uma linha de aviso, e o resto do relatório continua saindo.
rastro(bloco, item, encontrado, esperado) as (
  select
    '2) OBJETOS DO HOTFIX (NAO podem existir)',
    'evt  security_events.attempted_action exclusivo da versao nova',
    nullif(
      (xpath('/row/c/text()',
             query_to_xml(
               'select string_agg(distinct s.attempted_action, ''  |  '') as c'
               || '  from public.security_events s'
               || ' where s.attempted_action in ('
               || '   ''admin_login_completed_sem_aal2'','
               || '   ''admin_login_audit_failed'')',
               false, true, '')
            ))[1]::text,
      ''),
    'AUSENTE'
  where exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.security_events')
       and attname  = 'attempted_action'
       and attnum > 0 and not attisdropped
  )
),

-- Quando o guard acima barra, o relatório DIZ que não verificou. Silêncio
-- aqui seria pior que o erro: um bloco 2 todo OK, com uma verificação que
-- nunca rodou, é falsa tranquilidade.
rastro_indisponivel(bloco, item, encontrado, esperado) as (
  select
    '2) OBJETOS DO HOTFIX (NAO podem existir)',
    'evt  rastro por attempted_action  [NAO VERIFICADO]',
    case
      when to_regclass('public.security_events') is null
        then '(tabela public.security_events ausente)'
      else '(coluna attempted_action ausente — o schema mudou; confira o DDL antes de seguir)'
    end,
    'informativo'
  where not exists (
    select 1 from pg_attribute
     where attrelid = to_regclass('public.security_events')
       and attname  = 'attempted_action'
       and attnum > 0 and not attisdropped
  )
),

-- ---------------------------------------------------------------------
-- 3 — permissões EXECUTE das RPCs que a etapa 9 revoga
-- ---------------------------------------------------------------------
-- MEDIDO EM PRODUÇÃO, 2026-09-09, para register_admin_login_attempt:
--   PUBLIC .......... sem EXECUTE
--   anon ............ sem EXECUTE
--   authenticated ... TEM EXECUTE   <- a exposição real
--   service_role .... TEM EXECUTE   <- legítimo, tem que continuar
--
-- A vulnerabilidade exige SESSÃO. Não é qualquer visitante: é qualquer
-- usuário autenticado. Os arquivos do repositório (create_admin_login_
-- rate_limit.sql:163 e 02_schema.sql:22173) dizem que `anon` tem o
-- grant — estão desatualizados. Esta consulta é a fonte.
--
-- PUBLIC não é um role de verdade: `has_function_privilege('public',...)`
-- estoura. Para PUBLIC a leitura é direto na ACL, com grantee = 0.
--
-- E tem uma armadilha aqui: quando `proacl` é NULL, a ACL não está
-- "vazia" — está no DEFAULT, e o default de FUNÇÃO no Postgres é
-- EXECUTE para PUBLIC. Ler NULL como "ninguém tem permissão" inverte a
-- conclusão. Por isso os dois casos aparecem separados.
perm_public(bloco, item, encontrado, esperado) as (
  select
    '3) PERMISSOES EXECUTE (RPCs revogadas na etapa 9)',
    a.rotulo || '  ->  PUBLIC (pseudo-role)',
    case
      when a.rpc_oid is null then '(rpc ausente)'
      when (select p.proacl from pg_proc p where p.oid = a.rpc_oid) is null
        then 'TEM EXECUTE  <- proacl NULL = DEFAULT do Postgres (EXECUTE p/ PUBLIC)'
      when exists (
             select 1 from pg_proc p, aclexplode(p.proacl) x
              where p.oid = a.rpc_oid and x.grantee = 0
                and x.privilege_type = 'EXECUTE')
        then 'TEM EXECUTE  <- grantee PUBLIC presente na ACL (=X/dono)'
      else 'sem EXECUTE'
    end,
    'informativo'
  from alvo a
),

perm_roles(bloco, item, encontrado, esperado) as (
  select
    '3) PERMISSOES EXECUTE (RPCs revogadas na etapa 9)',
    a.rotulo || '  ->  ' || r.nome,
    case
      when a.rpc_oid is null then '(rpc ausente)'
      when has_function_privilege(r.nome, a.rpc_oid, 'EXECUTE')
        then 'TEM EXECUTE'
      else 'sem EXECUTE'
    end,
    'informativo'
  from alvo a
  cross join (values ('anon'), ('authenticated'), ('service_role')) r(nome)
  -- has_function_privilege estoura se o role nao existir
  where exists (select 1 from pg_roles g where g.rolname = r.nome)
),

perm_roles_ausentes(bloco, item, encontrado, esperado) as (
  select
    '3) PERMISSOES EXECUTE (RPCs revogadas na etapa 9)',
    'role ausente  ->  ' || r.nome,
    '(role NAO existe neste banco)',
    'informativo'
  from (values ('anon'), ('authenticated'), ('service_role')) r(nome)
  where not exists (select 1 from pg_roles g where g.rolname = r.nome)
),

-- ACL crua, para conferência manual
perm_acl(bloco, item, encontrado, esperado) as (
  select
    '3) PERMISSOES EXECUTE (RPCs revogadas na etapa 9)',
    a.rotulo || '  ->  proacl (bruto, do catalogo)',
    case
      when a.rpc_oid is null then '(rpc ausente)'
      else coalesce(
             (select p.proacl::text from pg_proc p where p.oid = a.rpc_oid),
             '(NULL — default do Postgres, ver linha do PUBLIC acima)')
    end,
    'informativo'
  from alvo a
),

-- ---------------------------------------------------------------------
-- 4 — como as RPCs estao definidas
-- ---------------------------------------------------------------------
-- SECURITY DEFINER + EXECUTE para `authenticated` e' exatamente a
-- combinacao que abre o bypass: a funcao roda com os poderes do DONO,
-- chamada por uma conta comum que nao tem nenhum desses poderes.
definicao(bloco, item, encontrado, esperado) as (
  select
    '4) DEFINICAO das RPCs',
    a.rotulo || '  ->  ' || x.item,
    x.valor,
    'informativo'
  from alvo a
  join pg_proc p on p.oid = a.rpc_oid
  cross join lateral (values
    ('dono',        pg_get_userbyid(p.proowner)),
    ('seguranca',   case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end),
    ('search_path', coalesce(array_to_string(p.proconfig, ' ; '), '(nao fixado)'))
  ) x(item, valor)
),

linhas as (
  select * from existencia
  union all select * from rastro
  union all select * from rastro_indisponivel
  union all select * from perm_public
  union all select * from perm_roles
  union all select * from perm_roles_ausentes
  union all select * from perm_acl
  union all select * from definicao
)

select
  l.bloco,
  l.item,
  coalesce(l.encontrado, '(ausente)') as encontrado,
  l.esperado,
  case
    when l.esperado = 'EXISTIR' then
      case when l.encontrado is not null then 'OK' else 'ATENCAO' end
    when l.esperado = 'AUSENTE' then
      case when l.encontrado is null then 'OK' else 'ATENCAO' end
    else 'INFO'
  end as situacao
from linhas l
order by l.bloco, l.item;

rollback;

-- =====================================================================
-- COMO LER O RESULTADO
-- =====================================================================
-- Liberado para aplicar a migração quando:
--
--   bloco 1  -> as 3 linhas em OK
--                (se `auth.users` faltar, a FK aborta a migração inteira,
--                 de propósito — melhor não aplicar do que aplicar sem a
--                 garantia de exclusão por titular)
--
--   bloco 2  -> as 6 linhas em OK
--                Qualquer ATENCAO aqui = a migração VAI ABORTAR sozinha,
--                e está certa em abortar. Não force: inspecione de onde
--                veio o objeto antes de qualquer limpeza. Se a tabela
--                tiver linhas, cada uma é um login administrativo já
--                registrado.
--
--   bloco 3  -> só descreve o estado de hoje; não há valor "certo" ainda.
--                Medido em 2026-09-09 para register_admin_login_attempt:
--                `authenticated` e `service_role` com EXECUTE; `PUBLIC` e
--                `anon` sem. É `authenticated` a vulnerabilidade.
--
--                SALVE ESTA SAÍDA. É ela, e não o dump do repositório,
--                que define o rollback da etapa 9. Reconceder `anon`
--                porque um arquivo diz que ela tinha DEIXARIA O SISTEMA
--                MAIS EXPOSTO do que antes do hotfix.
--
--                `log_security_event` ainda NÃO foi medida — foi
--                acrescentada aqui depois da primeira execução. Rode de
--                novo antes da etapa 9.
--
--   bloco 4  -> SECURITY DEFINER confirma a gravidade: a função roda com
--                os poderes do dono para uma conta que não os tem.
--
-- `admin-login/index.ts:155` chama `register_admin_login_attempt` com
-- service_role, para quem ainda NÃO tem sessão. É por isso que
-- service_role mantém o EXECUTE depois da etapa 9 — e é também a prova
-- de que `anon` não precisa dele: o login público já funciona hoje sem
-- que `anon` tenha permissão nenhuma.
-- =====================================================================
