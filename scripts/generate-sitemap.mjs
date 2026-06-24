import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const projectRoot = process.cwd();
const publicDir = path.join(projectRoot, 'public');
const sitemapPath = path.join(publicDir, 'sitemap.xml');

const siteUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://agrobw.com.br').replace(/\/+$/, '');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  '';

const categorySlugs = [
  'animais',
  'maquinas',
  'insumos',
  'imoveis',
  'servicos',
  'sementes',
];

const staticRoutes = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/anuncios', changefreq: 'daily', priority: '0.9' },
  { path: '/categorias', changefreq: 'weekly', priority: '0.9' },
  { path: '/planos', changefreq: 'weekly', priority: '0.8' },
  { path: '/vitrine', changefreq: 'weekly', priority: '0.7' },
  { path: '/lojas-parceiras', changefreq: 'weekly', priority: '0.8' },
  { path: '/noticias', changefreq: 'daily', priority: '0.8' },
  { path: '/quem-somos', changefreq: 'monthly', priority: '0.5' },
  { path: '/contato', changefreq: 'monthly', priority: '0.5' },
  { path: '/termos-de-uso', changefreq: 'yearly', priority: '0.2' },
  { path: '/privacidade', changefreq: 'yearly', priority: '0.2' },
  ...categorySlugs.map((slug) => ({
    path: `/anuncios?categoria=${slug}`,
    changefreq: 'daily',
    priority: '0.8',
  })),
];

const escapeXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const normalizeDate = (value) => {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const buildUrlEntry = ({ path: routePath, lastmod, changefreq, priority }) => {
  const loc = `${siteUrl}${routePath.startsWith('/') ? routePath : `/${routePath}`}`;
  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${escapeXml(normalizeDate(lastmod))}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>',
  ].join('\n');
};

const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
};

const collectDynamicRoutes = async () => {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.warn('[generate-sitemap] Supabase credentials ausentes. Gerando sitemap estático.');
    return [];
  }

  const entries = [];

  try {
    const [
      { data: announcements, error: announcementsError },
      { data: stores, error: storesError },
      { data: news, error: newsError },
    ] = await Promise.all([
      supabase
        .from('announcements')
        .select('id, updated_at, created_at, status')
        .eq('status', 'ACTIVE'),
      supabase
        .from('seller_stores')
        .select('slug, updated_at, created_at, is_active, is_store_feature_enabled')
        .eq('is_active', true)
        .eq('is_store_feature_enabled', true),
      supabase
        .from('news_articles')
        .select('slug, updated_at, published_at, status')
        .eq('status', 'published'),
    ]);

    if (announcementsError) {
      console.warn('[generate-sitemap] Não foi possível carregar anúncios:', announcementsError.message);
    } else {
      for (const announcement of announcements || []) {
        entries.push({
          path: `/anuncio/${announcement.id}`,
          lastmod: announcement.updated_at || announcement.created_at,
          changefreq: 'daily',
          priority: '0.8',
        });
      }
    }

    if (storesError) {
      console.warn('[generate-sitemap] Não foi possível carregar lojas:', storesError.message);
    } else {
      for (const store of stores || []) {
        if (!store.slug) continue;
        entries.push({
          path: `/loja/${store.slug}`,
          lastmod: store.updated_at || store.created_at,
          changefreq: 'weekly',
          priority: '0.7',
        });
      }
    }

    if (newsError) {
      console.warn('[generate-sitemap] Não foi possível carregar notícias:', newsError.message);
    } else {
      for (const article of news || []) {
        if (!article.slug) continue;
        entries.push({
          path: `/noticias/${article.slug}`,
          lastmod: article.updated_at || article.published_at,
          changefreq: 'weekly',
          priority: '0.7',
        });
      }
    }
  } catch (error) {
    console.warn('[generate-sitemap] Falha ao gerar rotas dinâmicas:', error instanceof Error ? error.message : error);
  }

  return entries;
};

const writeSitemap = async () => {
  const dynamicRoutes = await collectDynamicRoutes();
  const unique = new Map();

  for (const entry of [...staticRoutes, ...dynamicRoutes]) {
    unique.set(entry.path, entry);
  }

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...Array.from(unique.values()).map(buildUrlEntry),
    '</urlset>',
    '',
  ].join('\n');

  await fs.mkdir(publicDir, { recursive: true });
  await fs.writeFile(sitemapPath, sitemap, 'utf8');
  console.log(`[generate-sitemap] Sitemap gerado com ${unique.size} URLs em ${sitemapPath}`);
};

await writeSitemap();
