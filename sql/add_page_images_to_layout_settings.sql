-- Adiciona colunas de imagens personalizáveis para as páginas de Planos e Patrocinadores
-- Executar no Supabase SQL Editor

ALTER TABLE layout_settings
  ADD COLUMN IF NOT EXISTS pricing_hero_image_url    TEXT,
  ADD COLUMN IF NOT EXISTS pricing_store_image_url   TEXT,
  ADD COLUMN IF NOT EXISTS pricing_field_image_url   TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_hero_image_url    TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_harvest_image_url TEXT,
  ADD COLUMN IF NOT EXISTS sponsor_field_image_url   TEXT;
