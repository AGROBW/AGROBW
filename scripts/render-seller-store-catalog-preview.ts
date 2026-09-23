import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildSellerStoreCatalogDocument } from '../src/lib/sellerStoreCatalog/documentModel';
import { renderSellerStoreCatalogHtml } from '../src/lib/sellerStoreCatalog/renderHtml';

const output = resolve(process.argv[2] ?? 'tmp/pdfs/seller-store-catalog-stage2-preview.html');
const imageUrl = 'https://dockpbyzrvgewgdoaibn.supabase.co/storage/v1/object/public/ads-images/luna-gabrielly/maquinas-pesadas/outros/1789670100789-f1d917c2-e5fd-4685-b67e-ba69dbfd6cfe-art2.webp';

const document = buildSellerStoreCatalogDocument({
  exportId: 'preview-stage-2',
  catalogTitle: 'Selecao para a proxima safra',
  catalogSubtitle: 'Maquinas e equipamentos escolhidos para transformar produtividade em resultado.',
  priceMode: 'show',
  coverAlignment: 'right',
  generatedAt: '2026-09-21T18:00:00.000Z',
  store: {
    id: 'store-preview',
    slug: 'agro-campo-maquinas',
    store_name: 'Agro Campo Maquinas',
    description: 'Equipamentos selecionados, atendimento proximo e oportunidades para produtores de todo o Brasil.',
    cover_url: imageUrl,
    city: 'Campo Grande',
    state: 'MS',
    is_verified: true,
    public_url: 'https://agrobw.com.br/loja/agro-campo-maquinas',
  },
  announcements: [
    {
      id: 'balanca-bovinos',
      title: 'Balanca eletronica para bovinos',
      description: 'Conjunto completo para pesagem precisa, com estrutura reforcada e leitura digital para o manejo diario.',
      price: 12990,
      price_negotiable: true,
      product_condition: 'new',
      availability: 'pronta_entrega',
      accepts_trade: false,
      city: 'Campo Grande',
      state: 'MS',
      sub_category_label: 'Pecuaria de precisao',
      images: [imageUrl],
      public_url: 'https://agrobw.com.br/anuncio/balanca-bovinos',
    },
    {
      id: 'tronco-contencao',
      title: 'Tronco de contencao profissional',
      description: 'Projeto robusto para manejo seguro, com comandos ergonomicos e acabamento preparado para uso intensivo.',
      price: 28750,
      product_condition: 'new',
      availability: 'sob_encomenda',
      accepts_trade: true,
      city: 'Dourados',
      state: 'MS',
      sub_category_label: 'Equipamentos pecuarios',
      images: [imageUrl],
      public_url: 'https://agrobw.com.br/anuncio/tronco-contencao',
    },
    {
      id: 'kit-pesagem',
      title: 'Kit completo de pesagem rural',
      description: 'Indicador digital, barras de pesagem e cabos protegidos para uma instalacao pratica e confiavel.',
      price: 8490,
      price_negotiable: true,
      product_condition: 'seminovo',
      availability: 'available',
      accepts_trade: true,
      city: 'Rondonopolis',
      state: 'MT',
      sub_category_label: 'Balancas e acessorios',
      images: [imageUrl],
      public_url: 'https://agrobw.com.br/anuncio/kit-pesagem',
    },
  ],
});

const logo = await readFile(new URL('../public/agrobw-logo.png', import.meta.url));
const html = await renderSellerStoreCatalogHtml(document, {
  platformLogoUrl: `data:image/png;base64,${logo.toString('base64')}`,
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, html, 'utf8');
process.stdout.write(`${output}\n`);
