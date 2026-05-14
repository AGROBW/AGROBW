import React, { useEffect } from 'react';
import { buildAbsoluteSiteUrl, DEFAULT_OG_IMAGE_PATH } from '../src/lib/siteConfig';

type SeoHeadProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  image?: string | null;
  type?: 'website' | 'article';
  noIndex?: boolean;
};

const DEFAULT_TITLE_SUFFIX = 'AGRO BW';
const DEFAULT_DESCRIPTION =
  'Marketplace rural para comprar, vender e anunciar no agronegócio com mais visibilidade.';

const ensureHeadTag = (selector: string, create: () => HTMLElement) => {
  if (typeof document === 'undefined') return null;
  const existing = document.head.querySelector(selector);
  if (existing) return existing as HTMLElement;
  const element = create();
  document.head.appendChild(element);
  return element;
};

const setMetaByName = (name: string, content: string) => {
  const element = ensureHeadTag(`meta[name="${name}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    return meta;
  });

  element?.setAttribute('content', content);
};

const setMetaByProperty = (property: string, content: string) => {
  const element = ensureHeadTag(`meta[property="${property}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', property);
    return meta;
  });

  element?.setAttribute('content', content);
};

const setCanonical = (href: string) => {
  const element = ensureHeadTag('link[rel="canonical"]', () => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'canonical');
    return link;
  });

  element?.setAttribute('href', href);
};

const buildCanonicalUrl = (canonicalPath?: string) => {
  if (typeof window === 'undefined') return '';

  if (!canonicalPath) {
    return window.location.href;
  }

  try {
    return new URL(canonicalPath, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
};

const normalizeTitle = (title: string) => {
  const trimmed = title.trim();
  if (!trimmed) return DEFAULT_TITLE_SUFFIX;
  if (trimmed.includes(DEFAULT_TITLE_SUFFIX)) return trimmed;
  return `${trimmed} | ${DEFAULT_TITLE_SUFFIX}`;
};

const SeoHead: React.FC<SeoHeadProps> = ({
  title,
  description,
  canonicalPath,
  image,
  type = 'website',
  noIndex = false,
}) => {
  useEffect(() => {
    const finalTitle = normalizeTitle(title);
    const finalDescription = description.trim() || DEFAULT_DESCRIPTION;
    const canonicalUrl = buildCanonicalUrl(canonicalPath);
    const imageUrl = image
      ? (() => {
          try {
            return new URL(image, window.location.origin).toString();
          } catch {
            return image;
          }
        })()
      : buildAbsoluteSiteUrl(DEFAULT_OG_IMAGE_PATH);

    document.title = finalTitle;

    setMetaByName('description', finalDescription);
    setMetaByName('robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    setMetaByProperty('og:title', finalTitle);
    setMetaByProperty('og:description', finalDescription);
    setMetaByProperty('og:type', type);
    setMetaByProperty('og:url', canonicalUrl);
    setMetaByProperty('og:locale', 'pt_BR');
    setMetaByProperty('og:site_name', DEFAULT_TITLE_SUFFIX);

    setMetaByName('twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    setMetaByName('twitter:title', finalTitle);
    setMetaByName('twitter:description', finalDescription);

    setMetaByProperty('og:image', imageUrl);
    setMetaByProperty('og:image:width', '1200');
    setMetaByProperty('og:image:height', '630');
    setMetaByName('twitter:image', imageUrl);

    setCanonical(canonicalUrl);
  }, [canonicalPath, description, image, noIndex, title, type]);

  return null;
};

export default SeoHead;
