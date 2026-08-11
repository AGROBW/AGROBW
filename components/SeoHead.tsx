import React, { useEffect } from 'react';
import { buildCanonicalSiteUrl, resolveSeoImageUrl, isDefaultOgImage } from '../src/lib/siteConfig';
import { applyBrandSuffix, BRAND_NAME } from '../src/lib/seo/buildSeoMetadata';

type SeoHeadProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  image?: string | null;
  type?: 'website' | 'article';
  noIndex?: boolean;
};

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

const removeMetaByProperty = (property: string) => {
  if (typeof document === 'undefined') return;
  const element = document.head.querySelector(`meta[property="${property}"]`);
  if (element) element.remove();
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
  // Canonical determinístico: sempre no domínio canônico, inclusive em previews.
  if (canonicalPath) return buildCanonicalSiteUrl(canonicalPath);
  if (typeof window === 'undefined') return buildCanonicalSiteUrl('/');
  return buildCanonicalSiteUrl(window.location.pathname);
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
    const finalTitle = applyBrandSuffix(title);
    const finalDescription = description.trim() || DEFAULT_DESCRIPTION;
    const canonicalUrl = buildCanonicalUrl(canonicalPath);
    const imageUrl = resolveSeoImageUrl(image);

    document.title = finalTitle;

    setMetaByName('description', finalDescription);
    setMetaByName('robots', noIndex ? 'noindex, nofollow' : 'index, follow');

    setMetaByProperty('og:title', finalTitle);
    setMetaByProperty('og:description', finalDescription);
    setMetaByProperty('og:type', type);
    setMetaByProperty('og:url', canonicalUrl);
    setMetaByProperty('og:locale', 'pt_BR');
    setMetaByProperty('og:site_name', BRAND_NAME);

    setMetaByName('twitter:card', imageUrl ? 'summary_large_image' : 'summary');
    setMetaByName('twitter:title', finalTitle);
    setMetaByName('twitter:description', finalDescription);

    setMetaByProperty('og:image', imageUrl);
    if (isDefaultOgImage(imageUrl)) {
      // Só a imagem padrão tem dimensões conhecidas.
      setMetaByProperty('og:image:width', '1200');
      setMetaByProperty('og:image:height', '630');
    } else {
      // Imagem dinâmica: remove dimensões (inclusive resíduo da navegação SPA).
      removeMetaByProperty('og:image:width');
      removeMetaByProperty('og:image:height');
    }
    setMetaByName('twitter:image', imageUrl);

    setCanonical(canonicalUrl);
  }, [canonicalPath, description, image, noIndex, title, type]);

  return null;
};

export default SeoHead;
