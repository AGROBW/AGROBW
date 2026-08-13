import { rewrite, next } from '@vercel/functions';
import { isSocialCrawlerUA } from './src/lib/seo/socialCrawlerUA';

// Routing Middleware da Home. Roda ANTES do filesystem/cache — por isso consegue
// interceptar "/" que, de outra forma, é servido pelo index.html FÍSICO antes das
// rewrites (a Vercel dá precedência ao filesystem antes das rewrites; por isso a
// rewrite condicional de UA em "/" nunca disparava). NÃO é uma Serverless Function
// (não conta no limite de 12 do Hobby): é uma Routing Middleware/Edge separada.
//
// Escopo mínimo: matcher SOMENTE a Home. Nenhuma outra rota é afetada — sitemap,
// lojas, status reais, /index.html e trailingSlash seguem intactos.
export const config = { matcher: '/' };

// A resposta final de "/" varia por User-Agent (crawler social recebe o OG
// unificado; navegador recebe a SPA estática). Declara Vary p/ o CDN não misturar
// as variantes. ExtraResponseInit.headers do @vercel/functions é aplicado à
// RESPOSTA final ("These headers will be sent to the user response along with the
// response headers from the origin"), tanto no rewrite quanto no next.
const RESPONSE_HEADERS = { Vary: 'User-Agent' };

export default function middleware(request: Request): Response {
  const userAgent = request.headers.get('user-agent');
  const url = new URL(request.url);

  // O matcher "/" da Vercel expande para casar também "/index" (equivalência de
  // directory-index). Só a Home EXATA deve virar OG; "/index" e afins seguem a
  // rota normal (→ 404 real), sem virar alias 200 da Home para crawlers.
  const isHome = url.pathname === '/';

  // Decisão EXCLUSIVAMENTE por User-Agent — nunca por parâmetros públicos da URL.
  if (isHome && isSocialCrawlerUA(userAgent)) {
    // Reescrita INTERNA para o dispatcher OG, preservando a query string original.
    // Remove apenas o marcador interno _seo_route para que a query pública não
    // troque o modo do dispatcher — a Home OG é o modo default (sem marcador).
    url.pathname = '/api/og-loja';
    url.searchParams.delete('_seo_route');
    return rewrite(url, { headers: RESPONSE_HEADERS });
  }

  // Navegador comum (e qualquer path não-Home que o matcher tenha alcançado) →
  // segue a cadeia normal (index.html estático na Home; rota real caso contrário),
  // com Vary na resposta final para o cache por UA ficar correto.
  return next({ headers: RESPONSE_HEADERS });
}
