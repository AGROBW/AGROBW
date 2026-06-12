-- =====================================================================
-- AUDITORIA — Inventário READ-ONLY: views owner-rights + SECURITY DEFINER s/ search_path
-- Data: 2026-06-10 | NÃO altera nada. Rodar bloco a bloco e colar a saída.
-- =====================================================================

-- =====================================================================
-- BLOCO A — TODAS as views/matviews: owner, security_invoker, grants, risco
-- =====================================================================
select
  c.relname                                              as view,
  case c.relkind when 'v' then 'view' when 'm' then 'matview' end as tipo,
  pg_get_userbyid(c.relowner)                            as owner,
  ('security_invoker=true' = any(coalesce(c.reloptions, '{}'))) as security_invoker,
  has_table_privilege('anon',          c.oid, 'SELECT')  as anon_select,
  has_table_privilege('authenticated', c.oid, 'SELECT')  as auth_select,
  case
    when has_table_privilege('anon', c.oid,'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions,'{}'))) then 'CRITICO'
    when has_table_privilege('authenticated', c.oid,'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions,'{}'))) then 'ALTO'
    when has_table_privilege('anon', c.oid,'SELECT')
         or  has_table_privilege('authenticated', c.oid,'SELECT') then 'MEDIO'
    else 'BAIXO'
  end as risco
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('v','m') and n.nspname = 'public'
order by
  case
    when has_table_privilege('anon', c.oid,'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions,'{}'))) then 0
    when has_table_privilege('authenticated', c.oid,'SELECT')
         and not ('security_invoker=true' = any(coalesce(c.reloptions,'{}'))) then 1
    else 2
  end, c.relname;
-- LEITURA: owner=postgres + security_invoker=false + exposta -> roda como owner e
--   IGNORA a RLS das tabelas-base. CRITICO=anon owner-rights; ALTO=authenticated.
--   (security_invoker=true => respeita RLS-base => geralmente seguro.)

-- =====================================================================
-- BLOCO B — View -> tabelas-base consumidas (dependências reais)
-- =====================================================================
select
  dependent.relname as view,
  src.relname       as base,
  case src.relkind when 'r' then 'tabela' when 'v' then 'view' when 'm' then 'matview' end as base_tipo,
  srcns.relrowsecurity as base_rls_on
from pg_depend d
join pg_rewrite r       on r.oid = d.objid
join pg_class  dependent on dependent.oid = r.ev_class
join pg_namespace n     on n.oid = dependent.relnamespace
join pg_class  src      on src.oid = d.refobjid
join pg_class  srcns    on srcns.oid = src.oid
where d.deptype = 'n'
  and dependent.relkind in ('v','m')
  and n.nspname = 'public'
  and src.relkind in ('r','v','m')
  and dependent.relname <> src.relname
group by dependent.relname, src.relname, src.relkind, srcns.relrowsecurity
order by dependent.relname, src.relname;
-- LEITURA: para cada view de risco (Bloco A), ver quais bases ela lê e se a base
--   tem RLS. base_rls_on=false sob view owner-rights exposta = vazamento direto.

-- =====================================================================
-- BLOCO C — Colunas sensíveis expostas por view (cruzar com Bloco A)
-- =====================================================================
select table_name as view, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
                     where c.relkind in ('v','m') and n.nspname='public')
  and column_name ~* '(password|secret|token|api_key|access_key|cpf|cnpj|document|rg|email|whatsapp|phone|telefone|address|endereco|cep|birth|nascimento|ip_address|user_id|role|is_admin|balance|credit|amount|price)'
order by table_name, column_name;
-- LEITURA: view CRITICO/ALTO contendo password/token/cpf/email/phone/is_admin/role
--   = top prioridade (vaza dado sensível ignorando RLS).

-- =====================================================================
-- BLOCO D — TODAS as funções SECURITY DEFINER: assinatura, owner, EXECUTE, search_path
-- =====================================================================
select
  p.proname                                              as funcao,
  pg_get_function_identity_arguments(p.oid)              as args,
  pg_get_userbyid(p.proowner)                            as owner,
  has_function_privilege('anon',          p.oid,'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid,'EXECUTE') as auth_exec,
  (p.proconfig is not null and array_to_string(p.proconfig, ',') ~* 'search_path') as tem_search_path,
  array_to_string(p.proconfig, ', ')                     as config,
  case
    when not (p.proconfig is not null and array_to_string(p.proconfig, ',') ~* 'search_path')
         and has_function_privilege('anon', p.oid,'EXECUTE')          then 'CRITICO'
    when not (p.proconfig is not null and array_to_string(p.proconfig, ',') ~* 'search_path')
         and has_function_privilege('authenticated', p.oid,'EXECUTE') then 'ALTO'
    when not (p.proconfig is not null and array_to_string(p.proconfig, ',') ~* 'search_path') then 'MEDIO'
    else 'BAIXO'
  end as risco_search_path
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef = true
order by
  case
    when not (p.proconfig is not null and array_to_string(p.proconfig, ',') ~* 'search_path')
         and has_function_privilege('anon', p.oid,'EXECUTE') then 0
    when not (p.proconfig is not null and array_to_string(p.proconfig, ',') ~* 'search_path')
         and has_function_privilege('authenticated', p.oid,'EXECUTE') then 1
    else 2
  end, p.proname;
-- LEITURA: SECURITY DEFINER roda como owner (bypassa RLS). SEM search_path fixo =
--   risco de search_path hijack (CRITICO se anon pode EXECUTE). COM search_path =
--   risco mitigado; ainda checar guarda de authz interna (Bloco E/F).

-- =====================================================================
-- BLOCO E — Definer: detectar guarda de authz e tabelas sensíveis tocadas (heurístico)
-- =====================================================================
select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as args,
  (pg_get_functiondef(p.oid) ~* 'is_admin\(\)')                         as chama_is_admin,
  (pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)')                        as usa_auth_uid,
  (pg_get_functiondef(p.oid) ~* '(insert|update|delete)\s+(into\s+)?(public\.)?(users|payments|user_subscriptions|invoices|plans|payment_settings|fiscal_settings|news_social_settings|admin_audit_logs|smtp_settings)') as escreve_tabela_sensivel,
  has_function_privilege('anon',          p.oid,'EXECUTE') as anon_exec,
  has_function_privilege('authenticated', p.oid,'EXECUTE') as auth_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.prosecdef = true
order by
  (case when has_function_privilege('anon', p.oid,'EXECUTE') then 0
        when has_function_privilege('authenticated', p.oid,'EXECUTE') then 1 else 2 end),
  p.proname;
-- LEITURA / ALERTA:
--   escreve_tabela_sensivel=true + chama_is_admin=false + usa_auth_uid=false
--     + (anon/auth EXECUTE) -> definer que muta tabela sensível SEM authz interna
--     -> CRÍTICO (vetor tipo set_default_signup_plan já corrigido).
--   Para cada suspeita, capturar o corpo (Bloco F) e ler a authz real.

-- =====================================================================
-- BLOCO F — Captura de corpo das funções definer de risco (rodar por nome)
-- =====================================================================
-- Para cada função CRÍTICO/ALTO dos blocos D/E, capturar a definição completa:
--   select pg_get_functiondef('public.<nome>(<args>)'::regprocedure);
-- (substituir <nome>/<args> pela assinatura exata retornada nos blocos anteriores)

-- =====================================================================
-- O QUE ME DEVOLVER: BLOCO A + D (rankings, obrigatórios); BLOCO B, C, E (contexto/
-- enriquecimento). Para os CRÍTICO/ALTO de D/E, rodar o BLOCO F e colar os corpos.
-- Com isso eu: (1) priorizo views e funções por risco, (2) mapeio consumidores no
-- código (grep dirigido aos itens críticos), (3) separo vuln ativa x dívida x falso
-- positivo, (4) proponho correção mínima por item (security_invoker / revoke /
-- set search_path / guarda is_admin()/auth.uid() / RPC). Sem aplicar nada.
-- =====================================================================
