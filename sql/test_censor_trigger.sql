-- ============================================
-- TESTES RÁPIDOS: Sistema de Censura de Contatos
-- Execute linha por linha para testar cada padrão
-- ============================================

-- IMPORTANTE: Substitua os valores antes de executar:
-- - 'SEU-USER-ID': ID do seu usuário no Supabase
-- - 'SEU-CATEGORY-ID': ID de uma categoria existente

-- ============================================
-- TESTE 1: Telefone com DDD e hífen
-- ============================================

INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state
)
VALUES (
  'Trator John Deere - Ligue (64) 99342-4812',
  'Excelente estado',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  50000,
  50000,
  'DRAFT',
  'Goiânia',
  'GO'
)
RETURNING id, title, description;

-- RESULTADO ESPERADO:
-- title: 'Trator John Deere - Ligue [CONTATO PROTEGIDO]'
-- description: 'Excelente estado'

-- ============================================
-- TESTE 2: E-mail na descrição
-- ============================================

INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state
)
VALUES (
  'Colheitadeira Case',
  'Entre em contato pelo e-mail: vendedor@gmail.com para mais informações',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  150000,
  150000,
  'DRAFT',
  'Goiânia',
  'GO'
)
RETURNING id, title, description;

-- RESULTADO ESPERADO:
-- title: 'Colheitadeira Case'
-- description: 'Entre em contato pelo e-mail: [CONTATO PROTEGIDO] para mais informações'

-- ============================================
-- TESTE 3: Link na descrição
-- ============================================

INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state
)
VALUES (
  'Pulverizador Jacto',
  'Veja mais fotos em www.minhasloja.com.br e confira',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  35000,
  35000,
  'DRAFT',
  'Goiânia',
  'GO'
)
RETURNING id, title, description;

-- RESULTADO ESPERADO:
-- title: 'Pulverizador Jacto'
-- description: 'Veja mais fotos em [CONTATO PROTEGIDO] e confira'

-- ============================================
-- TESTE 4: Rede social com @
-- ============================================

INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state
)
VALUES (
  'Plantadeira Semeato',
  'Me siga no instagram @fazendavendas para ver mais equipamentos',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  45000,
  45000,
  'DRAFT',
  'Goiânia',
  'GO'
)
RETURNING id, title, description;

-- RESULTADO ESPERADO:
-- title: 'Plantadeira Semeato'
-- description: 'Me siga no [CONTATO PROTEGIDO] para ver mais equipamentos'

-- ============================================
-- TESTE 5: Múltiplos contatos (combo)
-- ============================================

INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state
)
VALUES (
  'Grade Aradora - Contato: 64 99342-4812',
  'Email: vendedor@hotmail.com | WhatsApp: 64993424812 | Instagram: @vendedor ou visite www.loja.com',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  18000,
  18000,
  'DRAFT',
  'Goiânia',
  'GO'
)
RETURNING id, title, description;

-- RESULTADO ESPERADO:
-- title: 'Grade Aradora - Contato: [CONTATO PROTEGIDO]'
-- description: 'Email: [CONTATO PROTEGIDO] | [CONTATO PROTEGIDO]: [CONTATO PROTEGIDO] | [CONTATO PROTEGIDO]: [CONTATO PROTEGIDO] ou visite [CONTATO PROTEGIDO]'

-- ============================================
-- TESTE 6: Texto limpo (sem contatos)
-- ============================================

INSERT INTO announcements (
  title,
  description,
  user_id,
  category_id,
  price,
  unit_price,
  status,
  city,
  state
)
VALUES (
  'Trator Massey Ferguson 4283',
  'Ano 2020, 1200 horas de uso, única dona, revisões em dia, pneus novos',
  'SEU-USER-ID',
  'SEU-CATEGORY-ID',
  180000,
  180000,
  'DRAFT',
  'Goiânia',
  'GO'
)
RETURNING id, title, description;

-- RESULTADO ESPERADO:
-- title: 'Trator Massey Ferguson 4283'
-- description: 'Ano 2020, 1200 horas de uso, única dona, revisões em dia, pneus novos'
-- (sem alterações, texto limpo)

-- ============================================
-- VERIFICAR TODOS OS TESTES
-- ============================================

-- Ver os últimos 6 anúncios criados (os testes acima)
SELECT 
  id,
  title,
  description,
  created_at,
  status
FROM announcements
WHERE status = 'DRAFT'
ORDER BY created_at DESC
LIMIT 6;

-- ============================================
-- LIMPAR TESTES
-- ============================================

-- CUIDADO: Este comando deleta TODOS os anúncios em DRAFT
-- Comente a linha abaixo para evitar exclusão acidental

-- DELETE FROM announcements WHERE status = 'DRAFT' AND created_at > NOW() - INTERVAL '5 minutes';

-- Ou delete apenas por IDs específicos:
-- DELETE FROM announcements WHERE id IN ('id1', 'id2', 'id3', 'id4', 'id5', 'id6');

-- ============================================
-- VERIFICAR O TRIGGER
-- ============================================

-- Confirmar que o trigger está ativo
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement,
  action_timing,
  action_orientation
FROM information_schema.triggers
WHERE trigger_name = 'censor_announcements_contact';

-- RESULTADO ESPERADO:
-- trigger_name: censor_announcements_contact
-- event_manipulation: INSERT, UPDATE
-- event_object_table: announcements
-- action_timing: BEFORE
-- action_orientation: ROW

-- ============================================
-- VERIFICAR A FUNÇÃO
-- ============================================

-- Confirmar que a função existe
SELECT 
  proname as function_name,
  pg_get_functiondef(oid) as function_definition
FROM pg_proc
WHERE proname = 'censor_contact_data';

-- RESULTADO ESPERADO:
-- function_name: censor_contact_data
-- function_definition: (código completo da função)

-- ============================================
-- TESTE DE UPDATE
-- ============================================

-- Pegar ID de um anúncio existente e tentar adicionar contato
UPDATE announcements
SET description = 'Contato: (64) 99999-9999'
WHERE id = 'SEU-ANNOUNCEMENT-ID'
RETURNING id, description;

-- RESULTADO ESPERADO:
-- description: 'Contato: [CONTATO PROTEGIDO]'

-- ============================================
-- SUCESSO! 🎉
-- ============================================

/*
Se todos os testes retornaram [CONTATO PROTEGIDO] nos lugares corretos,
o sistema está funcionando perfeitamente!

Próximos passos:
1. Testar no frontend (criar anúncio com contato no formulário)
2. Ver o toast de aviso aparecer
3. Confirmar que o texto é censurado automaticamente

Qualquer dúvida, consulte: docs/CONTACT_CENSORSHIP.md
*/
