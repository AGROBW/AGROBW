import DOMPurify from 'dompurify';

/**
 * Sanitizador de HTML rico (CMS / páginas institucionais / documentos legais).
 *
 * Endurecido com DOMPurify (motor testado), preservando a allowlist e o
 * comportamento do sanitizador caseiro anterior:
 *   - mesmo conjunto de tags permitidas;
 *   - apenas <a> mantém href/target/rel (removidos das demais tags);
 *   - <a target="_blank"> recebe rel="noopener noreferrer nofollow";
 *   - protocolos perigosos (javascript:, data:) bloqueados (default do DOMPurify);
 *   - texto de tags removidas é preservado (KEEP_CONTENT).
 *
 * Fail-closed: em ambiente SEM DOM (SSR/Node), retorna TEXTO escapado — nunca
 * HTML cru (substitui o antigo fallback por regex, que era burlável).
 *
 * A assinatura pública é mantida: sanitizeRichTextHtml(html: string): string.
 */

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'code', 'div', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'u', 'ul',
];

// Atributos permitidos globalmente; o hook abaixo restringe-os a <a>.
const ALLOWED_ATTR = ['href', 'target', 'rel'];
const ANCHOR_ONLY_ATTR = ['href', 'target', 'rel'];

let hooksConfigured = false;
const ensureHooks = () => {
  if (hooksConfigured) return;
  hooksConfigured = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as Element;
    const tag = (el.tagName || '').toLowerCase();

    // Paridade exata: href/target/rel só fazem sentido em <a>.
    if (tag !== 'a') {
      for (const attr of ANCHOR_ONLY_ATTR) el.removeAttribute(attr);
      return;
    }

    // Endurecimento de links que abrem em nova aba.
    if (el.getAttribute('target') === '_blank') {
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
  });
};

const escapeHtmlText = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Fail-closed: escapa TODO o conteúdo como texto. Nunca devolve HTML ativo e
 * preserva o texto integralmente (sem strip de tags, que perderia conteúdo
 * legítimo entre `<` e `>`). Exportado apenas para testes (T-C).
 */
export const __failClosedTextOnly = (html: string): string =>
  escapeHtmlText(String(html ?? ''));

export const sanitizeRichTextHtml = (html: string): string => {
  const content = String(html ?? '');
  if (!content) return '';

  // DOMPurify só é seguro com DOM real. Sem DOM (ou instância não suportada),
  // ele faria PASSTHROUGH do input — por isso falhamos fechado aqui.
  const domAvailable =
    typeof window !== 'undefined' &&
    Boolean((DOMPurify as unknown as { isSupported?: boolean }).isSupported);

  if (!domAvailable) {
    return __failClosedTextOnly(content);
  }

  ensureHooks();

  const clean = DOMPurify.sanitize(content, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // Redundante com a allowlist, mas explícito como defesa em profundidade:
    FORBID_TAGS: ['style', 'svg', 'math', 'script', 'iframe', 'object', 'embed', 'form', 'img', 'input', 'template'],
    FORBID_ATTR: ['style'],
    // Mantém o default seguro de URIs (bloqueia javascript:/data:; permite
    // http/https/mailto/tel e caminhos relativos).
  });

  return String(clean).trim();
};

export default sanitizeRichTextHtml;
