import { buildCanonicalSiteUrl } from '../siteConfig';

// Construtores de JSON-LD reutilizáveis. Geram URLs absolutas em agrobw.com.br.
// Mantidos leves e sem dados privados.

export type BreadcrumbEntry = { name: string; path: string };

export const buildBreadcrumbJsonLd = (entries: BreadcrumbEntry[]) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: entries.map((entry, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    name: entry.name,
    item: buildCanonicalSiteUrl(entry.path),
  })),
});

export const buildWebPageJsonLd = (params: {
  name: string;
  description: string;
  path: string;
}) => ({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: params.name,
  description: params.description,
  url: buildCanonicalSiteUrl(params.path),
});
