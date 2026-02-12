-- ============================================================================
-- REFATORAÇÃO: Renomear 'ads' para 'announcements' (Anti-AdBlock)
-- Data: 2026-02-07
-- Objetivo: Evitar bloqueio de requisições HTTP por extensões AdBlock
-- ============================================================================

-- PASSO 1: Renomear a tabela principal
ALTER TABLE public.ads RENAME TO announcements;

-- PASSO 2: Renomear constraints de chave primária (se necessário manter consistência)
ALTER TABLE public.announcements 
  RENAME CONSTRAINT ads_pkey TO announcements_pkey;

-- PASSO 3: Renomear constraints de foreign key em outras tabelas
-- 3.1 Tabela: favorites
ALTER TABLE public.favorites 
  DROP CONSTRAINT IF EXISTS favorites_ad_id_fkey;

ALTER TABLE public.favorites 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE public.favorites 
  ADD CONSTRAINT favorites_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- 3.2 Tabela: leads
ALTER TABLE public.leads 
  DROP CONSTRAINT IF EXISTS leads_ad_id_fkey;

ALTER TABLE public.leads 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE public.leads 
  ADD CONSTRAINT leads_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- 3.3 Tabela: chats (se existir)
ALTER TABLE public.chats 
  DROP CONSTRAINT IF EXISTS chats_ad_id_fkey;

ALTER TABLE public.chats 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE public.chats 
  ADD CONSTRAINT chats_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- 3.4 Tabela: ad_metrics (renomear também o nome da tabela)
ALTER TABLE public.ad_metrics RENAME TO announcement_metrics;

ALTER TABLE public.announcement_metrics 
  DROP CONSTRAINT IF EXISTS ad_metrics_ad_id_fkey;

ALTER TABLE public.announcement_metrics 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE public.announcement_metrics 
  ADD CONSTRAINT announcement_metrics_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- 3.5 Tabela: ad_technical_details (renomear também o nome da tabela)
ALTER TABLE public.ad_technical_details RENAME TO announcement_technical_details;

ALTER TABLE public.announcement_technical_details 
  DROP CONSTRAINT IF EXISTS ad_technical_details_ad_id_fkey;

ALTER TABLE public.announcement_technical_details 
  RENAME COLUMN ad_id TO announcement_id;

ALTER TABLE public.announcement_technical_details 
  ADD CONSTRAINT announcement_technical_details_announcement_id_fkey 
  FOREIGN KEY (announcement_id) 
  REFERENCES public.announcements(id) 
  ON DELETE CASCADE;

-- PASSO 4: Atualizar Políticas RLS
-- 4.1 Dropar políticas antigas da tabela ads
DROP POLICY IF EXISTS "Usuários podem ver anúncios ativos" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem criar seus próprios anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem atualizar seus próprios anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Usuários podem deletar seus próprios anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Admins podem ver todos os anúncios" ON public.announcements;
DROP POLICY IF EXISTS "Admins podem editar qualquer anúncio" ON public.announcements;

-- 4.2 Recriar políticas com novos nomes
CREATE POLICY "public_read_active_announcements" 
  ON public.announcements 
  FOR SELECT 
  USING (status = 'active'::text OR auth.uid() = user_id);

CREATE POLICY "users_create_own_announcements" 
  ON public.announcements 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users_update_own_announcements" 
  ON public.announcements 
  FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_announcements" 
  ON public.announcements 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- PASSO 5: Atualizar Triggers (se houver)
-- Exemplo: se houver trigger de updated_at
DROP TRIGGER IF EXISTS set_updated_at_ads ON public.announcements;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = now();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER set_updated_at_announcements
    BEFORE UPDATE ON public.announcements
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- PASSO 6: Atualizar índices (renomear para manter consistência)
ALTER INDEX IF EXISTS idx_ads_user_id RENAME TO idx_announcements_user_id;
ALTER INDEX IF EXISTS idx_ads_category_id RENAME TO idx_announcements_category_id;
ALTER INDEX IF EXISTS idx_ads_status RENAME TO idx_announcements_status;
ALTER INDEX IF EXISTS idx_ads_created_at RENAME TO idx_announcements_created_at;

-- PASSO 7: Comentários na tabela (documentação)
COMMENT ON TABLE public.announcements IS 'Tabela de anúncios do marketplace. Renomeada de "ads" para evitar bloqueios de AdBlock.';

-- PASSO 8: Atualizar VIEWs que usam a tabela ads
-- 8.1 Dropar e recriar a view chats_full (se existir)
DROP VIEW IF EXISTS public.chats_full;

CREATE OR REPLACE VIEW public.chats_full AS
SELECT 
  c.id,
  c.announcement_id,
  c.seller_id,
  c.buyer_id,
  c.status,
  c.created_at,
  c.last_message,
  c.last_message_time,
  c.unread_count,
  a.title AS ad_title,
  a.price AS ad_price,
  (a.images->>0) AS ad_image,
  seller.name AS seller_name,
  buyer.name AS buyer_name
FROM public.chats c
LEFT JOIN public.announcements a ON c.announcement_id = a.id
LEFT JOIN public.users seller ON c.seller_id = seller.id
LEFT JOIN public.users buyer ON c.buyer_id = buyer.id;

-- 8.2 Atualizar view de opportunities (se existir)
DROP VIEW IF EXISTS public.opportunities_view;

CREATE OR REPLACE VIEW public.opportunities_view AS
SELECT 
  o.id,
  o.user_id,
  o.announcement_id,
  o.expires_at,
  o.created_at,
  a.title AS announcement_title,
  a.price AS announcement_price
FROM public.opportunities o
LEFT JOIN public.announcements a ON o.announcement_id = a.id;

-- ============================================================================
-- NOTAS IMPORTANTES:
-- 1. Execute este script em um ambiente de teste primeiro
-- 2. Faça backup completo do banco antes de executar em produção
-- 3. Verifique se há outras tabelas ou funções que referenciam 'ads'
-- 4. Atualize todos os endpoints da API e código do frontend após aplicar
-- 5. O bucket 'ads-images' pode ser mantido pois não afeta requisições HTTP
-- ============================================================================

-- VERIFICAÇÃO FINAL: Listar todas as tabelas e constraints
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table
FROM pg_constraint 
WHERE confrelid = 'public.announcements'::regclass
ORDER BY conrelid::regclass::text;
