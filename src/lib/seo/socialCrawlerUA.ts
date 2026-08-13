// Lista canônica de crawlers SOCIAIS (sem motores de busca — anti-cloaking).
// É a MESMA lista usada no projeto para OG social; o handler document
// (server/document-status-handler.mjs) mantém uma cópia idêntica desta fonte.
// Fonte única consumida pela Routing Middleware da Home (middleware.ts) para
// decidir a variante por User-Agent — NUNCA por parâmetros públicos da URL.
export const SOCIAL_CRAWLER_UAS = [
  'facebookexternalhit',
  'facebot',
  'twitterbot',
  'whatsapp',
  'linkedinbot',
  'slackbot',
  'telegrambot',
  'discordbot',
  'pinterest',
  'redditbot',
  'embedly',
  'skypeuripreview',
  'vkshare',
  'qwantify',
  'bitlybot',
] as const;

export const SOCIAL_CRAWLER_UA_SOURCE = SOCIAL_CRAWLER_UAS.join('|');

export const SOCIAL_CRAWLER_UA_RE = new RegExp(`(${SOCIAL_CRAWLER_UA_SOURCE})`, 'i');

export const isSocialCrawlerUA = (userAgent: string | null | undefined): boolean =>
  typeof userAgent === 'string' && SOCIAL_CRAWLER_UA_RE.test(userAgent);
