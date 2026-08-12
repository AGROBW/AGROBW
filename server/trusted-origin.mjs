// Origem canônica pública, centralizada. Metadados (canonical, og:url, og:image,
// twitter:image) E o carregamento interno do index.html usam SEMPRE este domínio.
//
// NUNCA derivar a origem de Host/x-forwarded-host nem de VERCEL_URL: o hostname
// do deployment da Vercel pode servir a proteção de deployment (página de login/
// SSO) no lugar do index.html real da aplicação — que não deve receber OG.
export const CANONICAL_ORIGIN = 'https://agrobw.com.br';
