alter table public.news_social_settings
  add column if not exists default_instagram_story_image_url text,
  add column if not exists default_instagram_story_image_path text,
  add column if not exists default_linkedin_image_url text,
  add column if not exists default_linkedin_image_path text;
