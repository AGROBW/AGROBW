-- =====================================================================
-- HOTFIX ISOLADO — login administrativo: idempotência atômica + revogação
--
-- PARA REVISÃO. **NÃO APLICADO.**
--
-- Entrega MÍNIMA. Não contém regra de planos, banner, dashboard nem
-- métrica financeira. Só o necessário para fechar a vulnerabilidade
-- ativa, porque ela não deve esperar o deploy dos planos.
--
-- =====================================================================
-- A VULNERABILIDADE
-- =====================================================================
-- `register_admin_login_attempt(text, boolean, text, text)` está
-- concedida a `anon` e `authenticated`
-- (sql/create_admin_login_rate_limit.sql:163).
--
-- Ela alimenta o RATE LIMIT do login administrativo: chamar com
-- `p_success = true` e o e-mail de um administrador insere
-- `admin_login_success` em `security_events` e **reabre a janela de
-- tentativas daquele administrador**. Qualquer visitante pode zerar o
-- bloqueio por força bruta de qualquer admin, repetidamente.
--
-- =====================================================================
-- O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR DO HOTFIX
-- =====================================================================
-- A idempotência estava no Edge, em check-then-insert:
--
--     SELECT em security_events  ->  se não achou, chama a RPC
--
-- Duas requisições simultâneas passam as duas pelo SELECT antes de
-- qualquer INSERT, e gravam as duas. Não era garantia, era corrida.
--
-- Agora a garantia é do BANCO, por índice único, e a chave é a SESSÃO —
-- não o e-mail com janela de tempo:
--
--   · replay da MESMA sessão .................. converge, não duplica;
--   · outro login genuíno, OUTRA sessão, no
--     mesmo minuto ............................ é registrado, como deve.
--
-- A janela por e-mail confundia as duas coisas.
--
-- =====================================================================
-- SOBRE O HASH — o token NUNCA é armazenado
-- =====================================================================
-- A chave gravada é `encode(digest(session_id, 'sha256'), 'hex')`, com
-- `session_id` extraído do JWT **já verificado** pela Edge Function.
--
--   · `session_id` é um UUID de sessão, não credencial de acesso;
--   · o access token NÃO é enviado nem gravado em lugar nenhum;
--   · o hash é SHA-256 hexadecimal minúsculo, 64 caracteres, calculado
--     no Edge por `crypto.subtle.digest`. O banco recebe só o hash, e
--     valida o FORMATO com `^[0-9a-f]{64}$` — não só o comprimento.
--
-- Guardar o hash e não o `session_id` evita que a tabela de auditoria
-- vire um índice de sessões ativas.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- PRÉ-VERIFICAÇÃO
-- ---------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)') is null then
    raise exception 'PRE-VERIFICACAO: register_admin_login_attempt nao encontrada com a assinatura esperada';
  end if;
  if to_regclass('public.security_events') is null then
    raise exception 'PRE-VERIFICACAO: public.security_events nao existe';
  end if;
  if to_regproc('extensions.digest') is null and to_regproc('public.digest') is null then
    raise notice 'AVISO: pgcrypto nao localizado — o hash e calculado no Edge, entao isto nao bloqueia';
  end if;
  raise notice 'pre-verificacao basica ok';
end $$;

-- ---------------------------------------------------------------------
-- PRÉ-CONDIÇÃO: nada novo pode existir de antes
-- ---------------------------------------------------------------------
-- ESTA MIGRAÇÃO NÃO É REEXECUTÁVEL, e é de propósito.
--
-- A versão anterior tentava validar o schema quando os objetos já
-- existiam. Mas "validar o schema inteiro" é mais do que conferir nomes
-- de coluna: tipo, ordem, PRIMARY KEY na coluna CERTA, índices, FK,
-- RLS, políticas. Conferir só uma parte disso e dizer "schema validado"
-- é pior que não conferir — dá confiança que a checagem não sustenta.
--
-- Então: se QUALQUER objeto novo já existir, a migração ABORTA e pede
-- inspeção manual. Aplicação parcial é evento raro e sério; substituir
-- automaticamente o que sobrou de uma execução interrompida é como se
-- perde dado sem perceber.
--
-- Para reaplicar depois de uma execução interrompida, o operador precisa
-- olhar o que existe, decidir, e limpar à mão. O bloco de rollback no
-- rodapé traz os comandos.
do $$
declare
  v_encontrados text[] := array[]::text[];
begin
  if to_regclass('public.admin_login_completed_keys') is not null then
    v_encontrados := v_encontrados || 'tabela public.admin_login_completed_keys'::text;
  end if;
  if to_regprocedure('public.register_admin_login_completed(text, uuid, text, text)') is not null then
    v_encontrados := v_encontrados || 'funcao register_admin_login_completed(text,uuid,text,text)'::text;
  end if;
  if to_regprocedure('public.register_admin_login_completed(text, uuid, text)') is not null then
    v_encontrados := v_encontrados || 'funcao register_admin_login_completed(text,uuid,text) [assinatura antiga]'::text;
  end if;
  if to_regprocedure('public.limpar_admin_login_keys(integer)') is not null then
    v_encontrados := v_encontrados || 'funcao limpar_admin_login_keys(integer)'::text;
  end if;

  if array_length(v_encontrados, 1) > 0 then
    raise exception E'ABORTADO — objeto(s) desta migracao JA EXISTEM:\n  %\n\n'
      'Isto indica execucao anterior (completa ou interrompida). A migracao NAO '
      'substitui automaticamente: aplicacao parcial exige inspecao manual.\n\n'
      'Confira o estado atual e, se decidir reaplicar, limpe com o bloco de '
      'rollback do rodape deste arquivo.',
      array_to_string(v_encontrados, E'\n  ');
  end if;

  raise notice 'pre-condicao ok — nenhum objeto desta migracao existe ainda';
end $$;

-- ---------------------------------------------------------------------
-- 1. A chave idempotente, com UNIQUE — a garantia é aqui
-- ---------------------------------------------------------------------
-- MINIMIZACAO DE DADOS
--
-- A tabela guarda o MINIMO para a idempotencia funcionar:
--
--   session_hash   a chave. E so ela que decide replay.
--   user_id        NAO participa da idempotencia. Existe para exclusao
--                  por titular — e a justificativa SO se sustenta com o
--                  indice `ix_admin_login_keys_user` e a FK
--                  `on delete cascade` criados logo abaixo. Sem os dois,
--                  apagar por titular varreria a tabela e dependeria de
--                  alguem lembrar de rodar o delete.
--   registrado_em  base da limpeza por idade.
--
-- `email` foi REMOVIDO. Ele nao tem uso operacional aqui: a
-- idempotencia usa `session_hash`, e o registro que interessa — com
-- e-mail, IP, user agent e motivo — ja fica em `security_events`.
-- Guardar o e-mail tambem aqui seria duplicar identificador sem ganho.
create table public.admin_login_completed_keys (
  session_hash  text        primary key,
  user_id       uuid        not null,
  registrado_em timestamptz not null default now()
);

comment on table public.admin_login_completed_keys is
  'Chave idempotente do registro de login administrativo concluido. `session_hash` = SHA-256 hex do `session_id` do JWT verificado. O token NUNCA e armazenado, e o e-mail NAO e guardado aqui (fica em security_events). A PRIMARY KEY e a garantia de exatamente-uma-vez sob concorrencia.';

create index ix_admin_login_keys_tempo
  on public.admin_login_completed_keys (registrado_em desc);

-- SEM ESTE INDICE, a justificativa de `user_id` nao se sustenta:
-- apagar por titular varreria a tabela inteira.
create index ix_admin_login_keys_user
  on public.admin_login_completed_keys (user_id);

-- FK DIRETA, sem rede de proteção.
--
-- A versão anterior envolvia isto num `exception when others` que
-- degradava para `NOTICE`. Era o pior dos mundos: a migração dizia
-- "aplicada", a coluna `user_id` ficava sem a garantia que justifica sua
-- existência, e ninguém saberia — a exclusão por titular passaria a
-- depender de alguém lembrar de rodar um `delete`.
--
-- Este é um projeto Supabase: `auth.users` existe. Se por algum motivo a
-- FK não puder ser criada, a transação INTEIRA aborta, e é o
-- comportamento certo: melhor não aplicar do que aplicar sem a garantia.
alter table public.admin_login_completed_keys
  add constraint fk_admin_login_keys_user
  foreign key (user_id) references auth.users(id) on delete cascade;

comment on column public.admin_login_completed_keys.user_id is
  'NAO participa da idempotencia. Existe para exclusao por titular: a FK ON DELETE CASCADE remove as chaves quando a conta e apagada, e o indice ix_admin_login_keys_user torna a remocao dirigida, sem varredura.';

alter table public.admin_login_completed_keys enable row level security;
revoke all on table public.admin_login_completed_keys from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. A RPC transacional — insere a chave E registra, ou nada
-- ---------------------------------------------------------------------
-- `on conflict do nothing` + `found` dá exatamente-uma-vez: sob duas
-- transações simultâneas com a mesma chave, a segunda BLOQUEIA no índice
-- até a primeira confirmar, e então insere zero linhas.
create or replace function public.register_admin_login_completed(
  p_session_hash text,
  p_user_id      uuid,
  p_email        text,
  p_user_agent   text default null
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Comprimento NAO e formato. `length = 64` aceitaria 64 letras
  -- quaisquer, inclusive algo colado por engano. Exige-se hexadecimal
  -- minusculo, que e o que `crypto.subtle.digest` produz no Edge.
  if p_session_hash is null or p_session_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'session_hash invalido: esperado SHA-256 hexadecimal minusculo de 64 caracteres';
  end if;
  if p_user_id is null or v_email = '' then
    raise exception 'user_id e email sao obrigatorios';
  end if;

  insert into public.admin_login_completed_keys (session_hash, user_id)
  values (p_session_hash, p_user_id)
  on conflict (session_hash) do nothing;

  if not found then
    -- a sessão já registrou: replay. Converge, não duplica.
    return 'ja_registrado';
  end if;

  -- Só a primeira chamada da sessão chega aqui. Mesma RPC de sempre —
  -- que grava `admin_login_success` e mantém a semântica do rate limit.
  perform public.register_admin_login_attempt(
    p_email      := v_email,
    p_success    := true,
    p_reason     := 'Login administrativo concluido com MFA valido.',
    p_user_agent := p_user_agent
  );

  return 'registrado';
end;
$$;

revoke all on function public.register_admin_login_completed(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.register_admin_login_completed(text, uuid, text, text)
  to service_role;

-- ---------------------------------------------------------------------
-- 3. Limpeza das chaves antigas — **MANUAL**
-- ---------------------------------------------------------------------
-- ATENÇÃO, correção de uma afirmação anterior: NÃO existe retenção
-- automática de 90 dias. A função abaixo apenas EXISTE; nada a executa
-- sozinho. Dizer "retenção de 90 dias" sem agendador seria descrever um
-- comportamento que o banco não tem.
--
-- Não criei agendamento porque isso exige confirmar, em produção, que
-- `pg_cron` está instalado e qual é o padrão de agendamento do projeto —
-- e não tenho essa confirmação. Criar `cron.schedule` no escuro pode
-- falhar na migração ou, pior, duplicar um agendador já existente.
--
-- COMO EXECUTAR HOJE (manual, por service_role):
--   select public.limpar_admin_login_keys(90);
--
-- Quanto isso pesa: uma linha por sessão administrativa concluída.
-- Alguns registros por dia. A tabela não cresce a ponto de exigir
-- urgência — a limpeza é higiene, não necessidade operacional.
--
-- SE `pg_cron` for confirmado em produção, o agendamento seria:
--   select cron.schedule('limpar-admin-login-keys', '0 4 * * 0',
--                        $cron$ select public.limpar_admin_login_keys(90); $cron$);
-- Não aplicar sem confirmar a extensão e o padrão do projeto.
create or replace function public.limpar_admin_login_keys(p_dias int default 90)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n int;
begin
  delete from public.admin_login_completed_keys
   where registrado_em < now() - make_interval(days => greatest(p_dias, 7));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.limpar_admin_login_keys(int) from public, anon, authenticated;
grant execute on function public.limpar_admin_login_keys(int) to service_role;

commit;

-- =====================================================================
-- 4. REVOGAÇÕES — transação SEPARADA, e SÓ depois do bundle conferido
-- =====================================================================
-- NÃO execute este bloco junto com o anterior. Ele só pode rodar depois
-- da etapa de verificação do bundle publicado (3d da ordem): revogar
-- antes de o cliente ter parado de chamar quebra produção.
--
-- PRÉ-VERIFICAÇÃO — a saída É o rollback. Salve-a.
--
-- select p.oid::regprocedure as assinatura,
--        has_function_privilege('public',        p.oid, 'execute') as publico,
--        has_function_privilege('anon',          p.oid, 'execute') as anon,
--        has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--        has_function_privilege('service_role',  p.oid, 'execute') as service_role
-- from pg_proc p
-- where p.oid = any (array[
--         to_regprocedure('public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb)'),
--         to_regprocedure('public.register_admin_login_attempt(text, boolean, text, text)')
--       ]::oid[]);
--
-- begin;
--   -- 4a. register_admin_login_attempt: a vulnerabilidade ativa
--   revoke all on function public.register_admin_login_attempt(text, boolean, text, text) from public;
--   revoke all on function public.register_admin_login_attempt(text, boolean, text, text) from anon;
--   revoke all on function public.register_admin_login_attempt(text, boolean, text, text) from authenticated;
--   grant execute on function public.register_admin_login_attempt(text, boolean, text, text) to service_role;
--
--   -- 4b. log_security_event
--   revoke all on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) from public;
--   revoke all on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) from anon;
--   revoke all on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) from authenticated;
--   grant execute on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) to service_role;
-- commit;
--
-- ATENÇÃO: `admin-login/index.ts:155` chama `register_admin_login_attempt`
-- para quem AINDA NÃO TEM SESSÃO, com `service_role` — continua
-- funcionando. Em nenhuma hipótese reconceder a `anon`.
--
-- `get_admin_login_rate_limit_status(text)` NÃO é revogada: o formulário
-- de login precisa dela antes de haver sessão, e ela só LÊ.

-- =====================================================================
-- PÓS-VERIFICAÇÃO
-- =====================================================================
-- select to_regclass('public.admin_login_completed_keys');        -- não nulo
-- select count(*) from public.admin_login_completed_keys;         -- 0 no início
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='admin_login_completed_keys';
--   -- espera: session_hash, user_id, registrado_em. SEM email.
-- select indexname from pg_indexes
--  where schemaname='public' and tablename='admin_login_completed_keys';
--   -- espera a PK, ix_admin_login_keys_tempo e ix_admin_login_keys_user
-- select conname, confdeltype from pg_constraint
--  where conrelid='public.admin_login_completed_keys'::regclass and contype='f';
--   -- espera fk_admin_login_keys_user com confdeltype='c' (cascade)
-- select has_function_privilege('authenticated',
--   'public.register_admin_login_completed(text, uuid, text, text)', 'execute');  -- false
-- select has_function_privilege('service_role',
--   'public.register_admin_login_completed(text, uuid, text, text)', 'execute');  -- true
-- -- depois do bloco 4:
-- select has_function_privilege('anon',
--   'public.register_admin_login_attempt(text, boolean, text, text)', 'execute'); -- false

-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Reconceder EXATAMENTE o que a pré-verificação mostrou como true:
--
-- begin;
--   grant execute on function public.register_admin_login_attempt(text, boolean, text, text) to anon;
--   grant execute on function public.register_admin_login_attempt(text, boolean, text, text) to authenticated;
--   grant execute on function public.log_security_event(uuid, text, text, text, text, text, text, text, jsonb) to authenticated;
-- commit;
--
-- E, se for preciso desfazer também a parte nova, a ORDEM importa e é
-- mais longa do que eu havia escrito. Restaurar só o site não basta: a
-- Edge Function nova continuaria chamando `register_admin_login_completed`.
--
--   1. republicar o SITE anterior      (volta a chamar a RPC antiga)
--   2. republicar a EDGE FUNCTION anterior
--        -> sem este passo, a Edge nova fica dependente de uma RPC que o
--           passo 3 vai remover, e todo login cai em `audit: 'falhou'`
--   3. reconceder os EXECUTE (bloco acima)
--   4. só ENTÃO derrubar a RPC e a tabela:
--
-- begin;
--   drop function if exists public.limpar_admin_login_keys(int);
--   drop function if exists public.register_admin_login_completed(text, uuid, text, text);
--   drop table if exists public.admin_login_completed_keys;
-- commit;
--
-- Nenhuma função pré-existente é substituída por este hotfix: ele só
-- ACRESCENTA e, no bloco 4, revoga. Não há corpo antigo a restaurar.
--
-- =====================================================================
-- REAPLICAR depois de uma execução interrompida
-- =====================================================================
-- A pré-condição aborta se qualquer objeto já existir. Isso é
-- deliberado. Para reaplicar:
--
--   1. INSPECIONE o que existe e por quê:
--        select to_regclass('public.admin_login_completed_keys');
--        select count(*) from public.admin_login_completed_keys;
--        select p.oid::regprocedure from pg_proc p
--         where p.proname in ('register_admin_login_completed',
--                             'limpar_admin_login_keys');
--
--   2. Se a tabela tiver linhas, ENTENDA de onde vieram antes de
--      apagar — cada linha e um login administrativo ja registrado.
--
--   3. Só então limpe, com o bloco de rollback acima, e reaplique.
