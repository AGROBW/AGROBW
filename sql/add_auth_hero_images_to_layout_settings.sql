alter table public.layout_settings
  add column if not exists login_hero_image_url text,
  add column if not exists register_hero_image_url text;

comment on column public.layout_settings.login_hero_image_url is
  'Imagem lateral principal da tela de login.';

comment on column public.layout_settings.register_hero_image_url is
  'Imagem lateral principal da tela de cadastro.';
