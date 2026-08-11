import React from 'react';
import SeoHead from './SeoHead';
import StructuredData from './StructuredData';
import { SeoMetadata } from '../src/lib/seo/buildSeoMetadata';

// Componente único que aplica metadados (SeoHead) e, opcionalmente, JSON-LD
// (StructuredData) a uma página, a partir do objeto normalizado por
// buildSeoMetadata. Reduz duplicação e padroniza canonical/imagem/noindex.

type JsonLdData = Record<string, unknown> | Array<Record<string, unknown>>;

type PageSeoProps = {
  meta: SeoMetadata;
  jsonLdId?: string;
  jsonLd?: JsonLdData;
};

const PageSeo: React.FC<PageSeoProps> = ({ meta, jsonLdId, jsonLd }) => (
  <>
    <SeoHead
      title={meta.title}
      description={meta.description}
      canonicalPath={meta.canonical}
      image={meta.image}
      type={meta.type}
      noIndex={meta.noIndex}
    />
    {jsonLd && jsonLdId ? <StructuredData id={jsonLdId} data={jsonLd} /> : null}
  </>
);

export default PageSeo;
