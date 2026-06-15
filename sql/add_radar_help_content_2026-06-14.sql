-- =====================================================================
-- ABA "COMO FUNCIONA" DO RADAR DE OPORTUNIDADES
-- Data: 2026-06-14
-- Conteúdo editável pelo admin (Layout): título, descrição, vídeo (YouTube)
-- e toggle de exibição da aba. Idempotente.
-- =====================================================================

alter table public.layout_settings
  add column if not exists radar_help_title text,
  add column if not exists radar_help_description text,
  add column if not exists radar_help_video_url text,
  add column if not exists radar_help_enabled boolean not null default false;

comment on column public.layout_settings.radar_help_enabled is
  'Se true, exibe a aba "Como funciona" no Radar de Oportunidades.';

-- Verificação:
-- select radar_help_title, radar_help_video_url, radar_help_enabled from public.layout_settings limit 1;
