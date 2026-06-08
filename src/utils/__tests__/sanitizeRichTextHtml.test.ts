import { describe, it, expect } from 'vitest';
import { sanitizeRichTextHtml, __failClosedTextOnly } from '../sanitizeRichTextHtml';

// ---------------------------------------------------------------------------
// Reimplementação do sanitizador CASEIRO anterior (LEGADO) — usada só no T-D
// para comparar comportamento visual antigo x novo (DOMPurify).
// ---------------------------------------------------------------------------
const LEGACY_ALLOWED = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em', 'h1', 'h2', 'h3', 'h4',
  'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'u', 'ul',
]);

const legacySanitizeLinkHref = (href: string): string | null => {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;
  try {
    const parsed = new URL(trimmed, 'https://bwagro.com.br');
    if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) return trimmed;
  } catch {
    return null;
  }
  return null;
};

const legacySanitizeNode = (node: Node, doc: Document): Node | null => {
  if (node.nodeType === Node.TEXT_NODE) return doc.createTextNode(node.textContent || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as HTMLElement;
  const tagName = element.tagName.toLowerCase();
  if (!LEGACY_ALLOWED.has(tagName)) {
    const fragment = doc.createDocumentFragment();
    for (const child of Array.from(element.childNodes)) {
      const c = legacySanitizeNode(child, doc);
      if (c) fragment.appendChild(c);
    }
    return fragment;
  }
  const clean = doc.createElement(tagName);
  if (tagName === 'a') {
    const href = element.getAttribute('href');
    const safe = href ? legacySanitizeLinkHref(href) : null;
    if (safe) {
      clean.setAttribute('href', safe);
      clean.setAttribute('rel', 'noopener noreferrer nofollow');
      if (element.getAttribute('target') === '_blank') clean.setAttribute('target', '_blank');
    }
  }
  for (const child of Array.from(element.childNodes)) {
    const c = legacySanitizeNode(child, doc);
    if (c) clean.appendChild(c);
  }
  return clean;
};

const legacySanitize = (html: string): string => {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${String(html || '')}</div>`, 'text/html');
  const sourceRoot = parsed.body.firstElementChild;
  const cleanDoc = document.implementation.createHTMLDocument('');
  const cleanRoot = cleanDoc.createElement('div');
  for (const child of Array.from(sourceRoot?.childNodes || [])) {
    const c = legacySanitizeNode(child, cleanDoc);
    if (c) cleanRoot.appendChild(c);
  }
  return cleanRoot.innerHTML.trim();
};

// ---------------------------------------------------------------------------
// Helpers de comparação "visual" (multiset de tags + texto normalizado)
// ---------------------------------------------------------------------------
const tagMultiset = (html: string): string[] => {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return Array.from(doc.querySelectorAll('*'))
    .map((el) => el.tagName.toLowerCase())
    .sort();
};
const normText = (html: string): string => {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
};
const lower = (s: string) => s.toLowerCase();

// ===========================================================================
// T-A — SEGURANÇA (vetores devem ser NEUTRALIZADOS)
// ===========================================================================
describe('T-A segurança', () => {
  const xssVectors = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)></svg>',
    '<svg><script>alert(1)</script></svg>',
    '<iframe src="javascript:alert(1)"></iframe>',
    '<object data="javascript:alert(1)"></object>',
    '<embed src="x.swf">',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="JaVaScRiPt:alert(1)">x</a>',
    '<a href="jav&#x09;ascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<p onclick="alert(1)">x</p>',
    '<div style="background:url(javascript:alert(1))">x</div>',
    '<math><mtext><script>alert(1)</script></mtext></math>',
    '<template><img src=x onerror=alert(1)></template>',
    '<form><button formaction="javascript:alert(1)">x</button></form>',
  ];

  for (const vector of xssVectors) {
    it(`neutraliza: ${vector.slice(0, 40)}`, () => {
      const out = lower(sanitizeRichTextHtml(vector));
      expect(out).not.toContain('<script');
      expect(out).not.toContain('onerror');
      expect(out).not.toContain('onload');
      expect(out).not.toContain('onclick');
      expect(out).not.toContain('javascript:');
      expect(out).not.toContain('data:text/html');
      expect(out).not.toContain('<iframe');
      expect(out).not.toContain('<svg');
      expect(out).not.toContain('<img');
      expect(out).not.toContain('formaction');
      expect(out).not.toContain('<style');
    });
  }
});

// ===========================================================================
// T-B — PARIDADE / VISUAL (conteúdo permitido deve ser PRESERVADO)
// ===========================================================================
describe('T-B paridade', () => {
  it('mantém tags de formatação permitidas', () => {
    const html =
      '<h1>T</h1><h2>S</h2><p>par <strong>b</strong> <em>i</em> <u>u</u> <code>c</code></p>' +
      '<ul><li>a</li></ul><ol><li>b</li></ol><blockquote>q</blockquote><pre>p</pre><hr><br>';
    const out = lower(sanitizeRichTextHtml(html));
    for (const tag of ['h1', 'h2', 'p', 'strong', 'em', 'u', 'code', 'ul', 'li', 'ol', 'blockquote', 'pre', 'hr', 'br']) {
      expect(out).toContain(`<${tag}`);
    }
  });

  it('preserva href relativo, http/https, mailto e tel', () => {
    expect(sanitizeRichTextHtml('<a href="/rota">x</a>')).toContain('href="/rota"');
    expect(sanitizeRichTextHtml('<a href="https://ex.com">x</a>')).toContain('https://ex.com');
    expect(sanitizeRichTextHtml('<a href="mailto:a@b.com">x</a>')).toContain('mailto:a@b.com');
    expect(sanitizeRichTextHtml('<a href="tel:+55">x</a>')).toContain('tel:+55');
  });

  it('adiciona rel de segurança em target=_blank', () => {
    const out = sanitizeRichTextHtml('<a href="https://ex.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('target="_blank"');
  });

  it('href/target/rel só sobrevivem em <a> (não em outras tags)', () => {
    const out = lower(sanitizeRichTextHtml('<p href="/x" target="_blank">y</p>'));
    expect(out).toContain('<p');
    expect(out).not.toContain('href=');
    expect(out).not.toContain('target=');
  });

  it('mantém o TEXTO de tags removidas (KEEP_CONTENT)', () => {
    const out = sanitizeRichTextHtml('<div><script>bad()</script>Olá mundo</div>');
    expect(out).toContain('Olá mundo');
    expect(lower(out)).not.toContain('<script');
  });
});

// ===========================================================================
// T-C — FAIL-CLOSED (sem DOM → texto escapado, nunca HTML cru)
// ===========================================================================
describe('T-C fail-closed', () => {
  it('remove todas as tags e escapa o texto', () => {
    const out = __failClosedTextOnly('<script>alert(1)</script><b>oi</b>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('<b>');
    expect(out).toContain('oi');
  });

  it('escapa caracteres de controle de HTML', () => {
    const out = __failClosedTextOnly('a < b > c & "d" \'e\'');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).toContain('&amp;');
    expect(out).toContain('&quot;');
    expect(out).toContain('&#39;');
  });
});

// ===========================================================================
// T-D — CORPUS DIFF (legado x novo) — sem regressão visual
// ===========================================================================
describe('T-D corpus diff (legado x DOMPurify)', () => {
  // Corpus REPRESENTATIVO de conteúdo institucional/legal. Para o gate final,
  // o usuário deve rodar tambup o corpus REAL (export do banco) — ver relatório.
  const corpus = [
    '<h1>Política de Privacidade</h1><p>Texto introdutório com <strong>destaque</strong>.</p>',
    '<h2>1. Coleta</h2><p>Coletamos dados conforme a <a href="/legal/lgpd">LGPD</a>.</p>',
    '<ul><li>Item um</li><li>Item dois com <em>ênfase</em></li></ul>',
    '<ol><li>Primeiro</li><li>Segundo</li></ol>',
    '<blockquote>Citação relevante.</blockquote><pre><code>codigo()</code></pre>',
    '<p>Contato: <a href="mailto:contato@bwagro.com">e-mail</a> ou <a href="tel:+5511999">telefone</a>.</p>',
    '<p>Link externo <a href="https://gov.br" target="_blank">gov.br</a>.</p>',
    '<div><span>Bloco</span> com <b>negrito</b> e <i>itálico</i>.</div>',
    '<h2>Seção A</h2><p>a</p><h2>Seção B</h2><p>b</p><h2>Seção C</h2><p>c</p>',
    '<p>Conteúdo com tag desconhecida <fancy>texto preservado</fancy> no meio.</p>',
  ];

  for (const sample of corpus) {
    it(`tags e texto idênticos: ${sample.slice(0, 35)}...`, () => {
      const legacyOut = legacySanitize(sample);
      const newOut = sanitizeRichTextHtml(sample);
      // Contrato visual: mesmo conjunto de tags + mesmo texto visível.
      expect(tagMultiset(newOut)).toEqual(tagMultiset(legacyOut));
      expect(normText(newOut)).toEqual(normText(legacyOut));
    });
  }

  it('contagem de <h2> preservada (split de seções do LegalCmsDocumentView)', () => {
    const sample = '<h2>A</h2><p>a</p><h2>B</h2><p>b</p><h2>C</h2><p>c</p>';
    const countH2 = (html: string) => (tagMultiset(html).filter((t) => t === 'h2')).length;
    expect(countH2(sanitizeRichTextHtml(sample))).toBe(3);
    expect(countH2(sanitizeRichTextHtml(sample))).toBe(countH2(legacySanitize(sample)));
  });
});
