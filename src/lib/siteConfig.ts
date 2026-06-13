export const DEFAULT_SITE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_APP_URL) ||
  'https://bwagro.com.br';
export const DEFAULT_OG_IMAGE_PATH = '/og-default.png';

export const buildAbsoluteSiteUrl = (path = '/') => {
  try {
    return new URL(path, DEFAULT_SITE_URL).toString();
  } catch {
    return DEFAULT_SITE_URL;
  }
};
