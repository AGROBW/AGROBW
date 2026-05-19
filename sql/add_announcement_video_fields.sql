alter table public.announcements
  add column if not exists video_url text,
  add column if not exists video_storage_path text,
  add column if not exists video_thumbnail_url text,
  add column if not exists video_thumbnail_storage_path text,
  add column if not exists video_duration_seconds integer,
  add column if not exists video_size_bytes bigint;

comment on column public.announcements.video_url is
  'URL publica do video otimizado do anuncio.';

comment on column public.announcements.video_storage_path is
  'Caminho interno no storage para remocao/substituicao do video do anuncio.';

comment on column public.announcements.video_thumbnail_url is
  'URL publica da capa automatica gerada a partir do video do anuncio.';

comment on column public.announcements.video_thumbnail_storage_path is
  'Caminho interno no storage da capa automatica gerada para o video do anuncio.';

comment on column public.announcements.video_duration_seconds is
  'Duracao do video do anuncio em segundos.';

comment on column public.announcements.video_size_bytes is
  'Tamanho final do video otimizado em bytes.';
