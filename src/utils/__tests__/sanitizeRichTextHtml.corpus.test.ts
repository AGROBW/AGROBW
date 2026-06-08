import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sanitizeRichTextHtml } from '../sanitizeRichTextHtml';

/**
 * T-D com CORPUS REAL — gate final antes do deploy.
 *
 * Compara o sanitizador NOVO (DOMPurify, importado do código-fonte real) com o
 * sanitizador LEGADO (reimplementado abaixo) sobre o conteúdo REAL exportado de
 * `institutional_pages` (que também guarda os documentos legais).
 *
 * Contrato visual: para cada página, o conjunto de tags e o texto visível devem
 * ser IDÊNTICOS entre legado e novo. Qualquer diferença é reportada e FALHA o
 * teste (sinal de possível regressão visual — pare e revise).
 *
 * Como rodar:
 *   1) Exporte o conteúdo real (Supabase SQL Editor) e salve como corpus.json:
 *        select coalesce(
 *          json_agg(json_build_object('id', id, 'slug', slug, 'content', content)),
 *          '[]'::json)
 *        from public.institutional_pages;
 *   2) Rode apenas este teste apontando o arquivo:
 *        # bash:        CORPUS_FILE=./corpus.json npx vitest run src/utils/__tests__/sanitizeRichTextHtml.corpus.test.ts
 *        # PowerShell:  $env:CORPUS_FILE='./corpus.json'; npx vitest run src/utils/__tests__/sanitizeRichTextHtml.corpus.test.ts
 *
 * Sem CORPUS_FILE, o teste é PULADO (não afeta `npm test`).
 */

// --- Sanitizador LEGADO (cópia fiel do caseiro anterior) -------------------
const LEGACY_ALLOWED = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'u', 'ul',
]);
const legacyHref = (href: string): string | null => {
  const t = href.trim();
  if (!t) return null;
  if (t.startsWith('/') || t.startsWith('#')) return t;
  try {
    const p = new URL(t, 'https://bwagro.com.br');
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(p.protocol)) return t;
  } catch { return null; }
  return null;
};
const legacyNode = (node: Node, doc: Document): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (!LEGACY_ALLOWED.has(tag)) {
    const frag = doc.createDocumentFragment();
    for (const c of Array.from(el.childNodes)) { const s = legacyNode(c, doc); if (s) frag.appendChild(s); }
    return frag;
  }
  const clean = doc.createElement(tag);
  if (tag === 'a') {
    const href = el.getAttribute('href');
    const safe = href ? legacyHref(href) : null;
    if (safe) {
      clean.setAttribute('href', safe);
      clean.setAttribute('rel', 'noopener noreferrer nofollow');
      if (el.getAttribute('target') === '_blank') clean.setAttribute('target', '_blank');
    }
  }
  for (const c of Array.from(el.childNodes)) { const s = legacyNode(c, doc); if (s) clean.appendChild(s); }
  return clean;
};
const legacySanitize = (html: string): string => {
  const parsed = new DOMParser().parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
  const src = parsed.body.firstElementChild;
  const cleanDoc = document.implementation.createHTMLDocument('');
  const root = cleanDoc.createElement('div');
  for (const c of Array.from(src?.childNodes || [])) { const s = legacyNode(c, cleanDoc); if (s) root.appendChild(s); }
  return root.innerHTML.trim();
};

// --- Helpers de comparação visual ------------------------------------------
const tagMultiset = (html: string): string[] =>
  Array.from(new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').querySelectorAll('*'))
    .map((el) => el.tagName.toLowerCase())
    .sort();
const normText = (html: string): string =>
  (new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();

// --- Carregamento do corpus -------------------------------------------------
const CORPUS_FILE = process.env.CORPUS_FILE;

const loadCorpus = (): Array<{ id: string; content: string }> => {
  const raw = JSON.parse(readFileSync(CORPUS_FILE as string, 'utf8'));
  const arr = Array.isArray(raw)
    ? raw
    : (Object.values(raw).find((v) => Array.isArray(v)) as unknown[]) || [];
  return (arr as Array<Record<string, unknown>>).map((row, i) => ({
    id: String(row.id ?? row.slug ?? `row-${i}`),
    content: String(row.content ?? row.html ?? ''),
  }));
};

const maybe = CORPUS_FILE ? describe : describe.skip;

maybe('T-D corpus REAL (institutional_pages)', () => {
  it('tags e texto visível idênticos entre legado e DOMPurify', () => {
    const corpus = loadCorpus();
    expect(corpus.length).toBeGreaterThan(0);

    const diffs: string[] = [];
    for (const page of corpus) {
      const legacyOut = legacySanitize(page.content);
      const newOut = sanitizeRichTextHtml(page.content);

      const lTags = tagMultiset(legacyOut);
      const nTags = tagMultiset(newOut);
      const lText = normText(legacyOut);
      const nText = normText(newOut);

      if (JSON.stringify(lTags) !== JSON.stringify(nTags)) {
        diffs.push(`[${page.id}] TAGS divergem:\n  legado: ${lTags.join(',')}\n  novo  : ${nTags.join(',')}`);
      }
      if (lText !== nText) {
        diffs.push(`[${page.id}] TEXTO diverge:\n  legado: "${lText.slice(0, 200)}"\n  novo  : "${nText.slice(0, 200)}"`);
      }
    }

    if (diffs.length > 0) {
      throw new Error(
        `Regressão visual detectada em ${diffs.length} ponto(s) — PARE e revise:\n\n` +
          diffs.join('\n\n'),
      );
    }
  });
});
