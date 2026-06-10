-- =====================================================================
-- LOTE 2 — Diagnóstico READ-ONLY: tabelas SEM RLS e/ou com GRANTS amplos
-- Data: 2026-06-10 | NÃO altera nada. Rodar bloco a bloco e colar a saída.
-- Foco: encontrar tabelas onde anon/authenticated leem/escrevem SEM filtro de
-- linha (RLS off) ou com privilégio amplo demais (DML/TRUNCATE/REFERENCES).
-- =====================================================================

-- =====================================================================
-- BLOCO A — Tabelas com RLS DESABILITADA (relrowsecurity=false)
-- =====================================================================
select
  c.relname                                   as tabela,
  pg_get_userbyid(c.relowner)                  as owner,
  c.relrowsecurity                             as rls_habilitada,
  c.relforcerowsecurity                        as rls_forcada,
  (select count(*) from pg_policies p
     where p.schemaname='public' and p.tablename=c.relname) as qtd_policies,
  has_table_privilege('anon',          c.oid, 'SELECT') as anon_select,
  has_table_privilege('anon',          c.oid, 'INSERT') as anon_insert,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') as auth_insert,
  pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho,
  c.reltuples::bigint                          as linhas_estimadas
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname = 'public'
  and c.relrowsecurity = false
order by anon_select desc, auth_select desc, c.relname;
-- SINAL DE ALERTA:
--   rls_habilitada=false E (anon_select/auth_select=true) -> leitura SEM filtro
--     de linha para o role: qualquer um lê a tabela inteira.
--   rls_habilitada=false E (anon_insert/auth_insert=true) -> escrita SEM filtro.
-- PRIORIDADE:
--   CRÍTICO = RLS off + anon tem SELECT/INSERT (público lê/escreve tudo)
--   ALTO    = RLS off + authenticated tem SELECT/INSERT
--   MÉDIO   = RLS off mas sem grant anon/auth (só service_role usa) -> hardening

-- =====================================================================
-- BLOCO B — Tabelas com RLS ON porém SEM nenhuma policy (deny-all silencioso)
-- =====================================================================
select
  c.relname as tabela,
  has_table_privilege('anon',          c.oid, 'SELECT') as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind='r' and n.nspname='public' and c.relrowsecurity = true
  and not exists (select 1 from pg_policies p
                  where p.schemaname='public' and p.tablename=c.relname)
order by c.relname;
-- LEITURA: RLS on + 0 policies = nega tudo (exceto owner/service_role). Geralmente
--   SEGURO, mas pode indicar tabela "morta" ou fluxo que depende de service_role.
--   Não é brecha; serve para mapear e confirmar que nada do app quebra dependendo dela.

-- =====================================================================
-- BLOCO C — Grants amplos de anon/authenticated por tabela (DML/TRUNCATE/...)
-- =====================================================================
select
  table_name,
  grantee,
  string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants g
where table_schema = 'public'
  and grantee in ('anon','authenticated')
  and exists (  -- só TABELAS (exclui views; views vão no Lote 1/own bloco)
    select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=g.table_name and c.relkind='r')
group by table_name, grantee
order by
  (case when string_agg(privilege_type,',') ~* '(INSERT|UPDATE|DELETE|TRUNCATE)' then 0 else 1 end),
  table_name, grantee;
-- SINAL DE ALERTA:
--   anon com INSERT/UPDATE/DELETE/TRUNCATE -> escrita pública (só RLS protege).
--   anon/authenticated com TRUNCATE/REFERENCES/TRIGGER -> supérfluo histórico.
--   authenticated com DML em tabela que ele não deveria gerenciar (cruzar c/ RLS).
-- PRIORIDADE:
--   CRÍTICO = anon DML + (RLS off OU policy permissiva) na mesma tabela (ver Bloco E)
--   ALTO    = anon DML com RLS protegendo (dívida; fechar mesmo assim)
--   MÉDIO   = TRUNCATE/REFERENCES/TRIGGER sobrando (limpeza least-privilege)

-- =====================================================================
-- BLOCO D — Column privileges de ESCRITA em colunas sensíveis (anon/auth)
-- =====================================================================
select
  table_name, column_name, grantee, privilege_type
from information_schema.column_privileges
where table_schema='public'
  and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE')
  and column_name ~* '(role|is_admin|admin|status|price|amount|total|value|user_id|owner|verified|premium|highlight|balance|credit|email|whatsapp|phone|document|cpf|cnpj|token|secret|password|api_key)'
order by table_name, column_name, grantee;
-- ALERTA: UPDATE em colunas de authz/dinheiro/identidade/segredo -> escalonamento,
--   manipulação de preço/saldo, troca de dono, ou exfiltração/escrita de segredo.
-- PRIORIDADE: CRÍTICO (authz/dinheiro/segredo) · ALTO (PII/owner) · MÉDIO (resto)

-- =====================================================================
-- BLOCO E — CRUZAMENTO crítico: RLS off (ou sem policy) + grant anon/auth
-- =====================================================================
select
  c.relname as tabela,
  c.relrowsecurity as rls,
  (select count(*) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies,
  has_table_privilege('anon', c.oid,'SELECT') as anon_sel,
  has_table_privilege('anon', c.oid,'INSERT') as anon_ins,
  has_table_privilege('anon', c.oid,'UPDATE') as anon_upd,
  has_table_privilege('anon', c.oid,'DELETE') as anon_del,
  has_table_privilege('authenticated', c.oid,'SELECT') as auth_sel,
  has_table_privilege('authenticated', c.oid,'INSERT') as auth_ins,
  case
    when c.relrowsecurity=false and has_table_privilege('anon', c.oid,'SELECT')        then 'CRITICO'
    when c.relrowsecurity=false and has_table_privilege('anon', c.oid,'INSERT')        then 'CRITICO'
    when c.relrowsecurity=false and has_table_privilege('authenticated', c.oid,'SELECT') then 'ALTO'
    when c.relrowsecurity=false and has_table_privilege('authenticated', c.oid,'INSERT') then 'ALTO'
    when c.relrowsecurity=false                                                        then 'MEDIO'
    else 'OK'
  end as risco
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where c.relkind='r' and n.nspname='public'
  and c.relrowsecurity = false
order by
  case
    when c.relrowsecurity=false and has_table_privilege('anon', c.oid,'SELECT') then 0
    when c.relrowsecurity=false and has_table_privilege('anon', c.oid,'INSERT') then 0
    when c.relrowsecurity=false and has_table_privilege('authenticated', c.oid,'SELECT') then 1
    when c.relrowsecurity=false and has_table_privilege('authenticated', c.oid,'INSERT') then 1
    else 2
  end,
  c.relname;
-- ESTE É O RANKING-MÃE do Lote 2: linhas 'CRITICO' = tabela exposta SEM RLS ao
--   público. São os primeiros alvos. Para cada CRÍTICO/ALTO, listar colunas (Bloco F).

-- =====================================================================
-- BLOCO F — Detector de DADO SENSÍVEL por coluna (cruzar com Bloco E)
-- =====================================================================
select
  table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and column_name ~* '(password|secret|token|api_key|access_key|private|cpf|cnpj|document|rg|email|whatsapp|phone|telefone|address|endereco|cep|birth|nascimento|ip_address|user_id|role|is_admin|balance|credit|amount|price)'
order by table_name, column_name;
-- USO: ao cruzar com os 'CRITICO'/'ALTO' do Bloco E, mostra QUAL dado vaza.
--   Tabela CRÍTICA contendo password/token/secret/cpf/cnpj/email/phone = top prioridade.

-- =====================================================================
-- BLOCO G — Lista priorizada final (resumo p/ você me devolver)
-- =====================================================================
-- Não há query nova: me devolva a saída de:
--   BLOCO E (ranking de tabelas sem RLS, com flags anon/auth)  -> obrigatório
--   BLOCO C (grants amplos por tabela)                          -> obrigatório
--   BLOCO D (column privileges sensíveis)                       -> obrigatório
--   BLOCO F (colunas sensíveis das tabelas que aparecem no E)   -> obrigatório
--   BLOCO A e B                                                 -> contexto
-- Com isso eu: (1) priorizo por risco, (2) mapeio QUEM consome cada tabela no
--   app/código (grep dirigido às tabelas que saírem como CRÍTICO/ALTO),
--   (3) classifico risco real de exploração, (4) proponho correção mínima por
--   tabela (enable RLS + policy mínima / revoke grant / column revoke), sem
--   quebrar produção.
-- =====================================================================
