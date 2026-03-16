-- ==================================================
-- SCRIPT DE DEBUG: Verificar Subscriptions da Livia
-- ==================================================
-- Execute este script no SQL Editor do Supabase para
-- diagnosticar por que o plano não aparece.
-- ==================================================

-- 1️⃣ VERIFICAR SE O USUÁRIO EXISTE
-- ==================================================
SELECT 
  id,
  name,
  email,
  document,
  created_at
FROM public.users
WHERE id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef';

-- Resultado esperado: 1 linha com dados da Livia
-- ❌ Se retornar vazio: ID do usuário está errado


-- 2️⃣ VERIFICAR SUBSCRIPTIONS (TODAS)
-- ==================================================
SELECT 
  us.id as subscription_id,
  us.user_id,
  us.plan_id,
  us.status,
  us.created_at,
  us.current_period_start,
  us.current_period_end,
  p.name as plan_name,
  p.monthly_price
FROM public.user_subscriptions us
LEFT JOIN public.plans p ON us.plan_id = p.id
WHERE us.user_id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef';

-- Resultado esperado: 1+ linhas se há subscriptions
-- ❌ Se retornar vazio: Livia NÃO TEM subscriptions (precisa criar)
-- ⚠️ Se plan_name = NULL: FK plan_id está quebrada


-- 3️⃣ VERIFICAR SUBSCRIPTIONS ATIVAS
-- ==================================================
SELECT 
  us.id as subscription_id,
  us.user_id,
  us.status,
  p.name as plan_name
FROM public.user_subscriptions us
LEFT JOIN public.plans p ON us.plan_id = p.id
WHERE us.user_id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef'
  AND us.status = 'active';

-- Resultado esperado: 1 linha se há subscription ATIVA
-- ❌ Se retornar vazio: 
--    - Subscription não existe, OU
--    - Status é diferente de 'active' (ex: 'pending', 'cancelled')


-- 4️⃣ VERIFICAR TODOS OS PLANOS DISPONÍVEIS
-- ==================================================
SELECT 
  id as plan_id,
  name,
  monthly_price,
  created_at
FROM public.plans
ORDER BY created_at;

-- Use o plan_id daqui para criar uma subscription (próxima query)


-- 5️⃣ CRIAR SUBSCRIPTION PARA LIVIA (SE NÃO EXISTIR)
-- ==================================================
-- ⚠️ EXECUTE APENAS SE A QUERY 2 RETORNOU VAZIO
-- ==================================================

-- Escolha um plan_id da query 4 e substitua abaixo:
INSERT INTO public.user_subscriptions (
  user_id,
  plan_id,
  status,
  current_period_start,
  current_period_end
) VALUES (
  'f62bc8aa-b646-43f0-b37d-9060f7064aef',  -- Livia
  'COLE_AQUI_O_PLAN_ID',                    -- ⚠️ SUBSTITUIR pelo plan_id correto
  'active',
  NOW(),
  NOW() + INTERVAL '30 days'
);

-- Após executar, recarregue o painel administrativo


-- 6️⃣ VERIFICAR ROW LEVEL SECURITY (RLS)
-- ==================================================
-- Se a query 2 retornou vazio mas você JÁ criou a subscription,
-- o problema pode ser RLS (Row Level Security)
-- ==================================================

-- Verificar políticas RLS na tabela user_subscriptions:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'user_subscriptions';

-- Se houver políticas restritivas, desative temporariamente:
-- ALTER TABLE public.user_subscriptions DISABLE ROW LEVEL SECURITY;


-- 7️⃣ QUERY COMPLETA (SIMULA O JOIN DO FRONTEND)
-- ==================================================
-- Esta query simula exatamente o que o frontend faz
-- ==================================================

SELECT 
  u.id,
  u.name,
  u.email,
  json_agg(
    json_build_object(
      'status', us.status,
      'plans', json_build_object('name', p.name)
    )
  ) FILTER (WHERE us.id IS NOT NULL) as user_subscriptions
FROM public.users u
LEFT JOIN public.user_subscriptions us ON us.user_id = u.id
LEFT JOIN public.plans p ON p.id = us.plan_id
WHERE u.id = 'f62bc8aa-b646-43f0-b37d-9060f7064aef'
GROUP BY u.id, u.name, u.email;

-- Resultado esperado:
-- {
--   "id": "f62bc8aa...",
--   "name": "Livia",
--   "user_subscriptions": [
--     {
--       "status": "active",
--       "plans": { "name": "PRO" }
--     }
--   ]
-- }

-- ❌ Se user_subscriptions = NULL: Não há subscriptions


-- ==================================================
-- RESUMO DE DIAGNÓSTICO
-- ==================================================

-- ✅ CENÁRIO 1: Subscription Existe e Está Ativa
--    Query 2 retorna dados, Query 3 retorna 1 linha
--    → SOLUÇÃO: Problema é no frontend (RLS ou cache)
--
-- ⚠️ CENÁRIO 2: Subscription Existe Mas Não Está Ativa
--    Query 2 retorna dados, Query 3 retorna vazio
--    → SOLUÇÃO: UPDATE user_subscriptions SET status = 'active' WHERE ...
--
-- ❌ CENÁRIO 3: Subscription Não Existe
--    Query 2 retorna vazio
--    → SOLUÇÃO: Execute a query 5 para criar
--
-- 🔧 CENÁRIO 4: FK Quebrada (plan_id inválido)
--    Query 2 retorna dados mas plan_name = NULL
--    → SOLUÇÃO: UPDATE user_subscriptions SET plan_id = 'PLAN_ID_VALIDO' WHERE ...
--
-- 🔒 CENÁRIO 5: RLS Bloqueando Leitura
--    Query 2 retorna vazio mas você JÁ criou manualmente
--    → SOLUÇÃO: Desative RLS temporariamente (query 6)

-- ==================================================
