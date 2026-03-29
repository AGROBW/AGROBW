export type CommodityKey = 'soja' | 'milho' | 'boi' | 'cafe';
export type SourceProvider = 'cepea' | 'custom';

export type MarketQuoteSourceRecord = {
  id: string;
  name: string;
  source_url: string;
  generated_url: string | null;
  commodity_target: CommodityKey;
  provider: SourceProvider;
  cepea_indicator_id: number | null;
  provider_label: string | null;
  refresh_interval_minutes: number;
  is_active: boolean;
};

export type ParsedMarketQuote = {
  commodity: CommodityKey;
  produto: string;
  preco: number;
  unidade: string;
  data_referencia: string;
  fonte: string;
  sourceUrl: string;
  rowPreview: {
    dateText: string;
    productText: string;
    priceText: string;
  };
};

export const cepeaIndicatorMap: Record<CommodityKey, number> = {
  boi: 2,
  cafe: 23,
  milho: 77,
  soja: 12,
};

export const commodityLabelMap: Record<CommodityKey, string> = {
  boi: 'Boi Gordo',
  cafe: 'Café Arábica',
  milho: 'Milho',
  soja: 'Soja',
};

export const buildCepeaUrl = (commodity: CommodityKey, customIndicatorId?: number | null) =>
  `https://www.cepea.org.br/br/widgetproduto.js.php?output=html&id_indicador[]=${
    customIndicatorId || cepeaIndicatorMap[commodity]
  }`;

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ');

const stripTags = (value: string) =>
  decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseBrazilianCurrency = (value: string): number | null => {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseReferenceDate = (value: string): string | null => {
  const fullDateMatch = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (fullDateMatch) {
    return `${fullDateMatch[3]}-${fullDateMatch[2]}-${fullDateMatch[1]}`;
  }

  const monthlyMatch = value.match(/(\d{2})\/(\d{4})/);
  if (monthlyMatch) {
    return `${monthlyMatch[2]}-${monthlyMatch[1]}-01`;
  }

  return null;
};

const extractTableRows = (html: string) => {
  const rows: Array<{ dateText: string; productText: string; priceText: string }> = [];

  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...(rowMatch[1] || '').matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      stripTags(cell[1] || '')
    );

    if (cells.length >= 3) {
      rows.push({
        dateText: cells[0],
        productText: cells[1],
        priceText: cells[2],
      });
    }
  }

  return rows;
};

const isLikelyCommodityRow = (commodity: CommodityKey, productText: string) => {
  const normalized = productText.toLowerCase();

  if (commodity === 'soja') return normalized.includes('soja');
  if (commodity === 'milho') return normalized.includes('milho');
  if (commodity === 'boi') return normalized.includes('boi');
  if (commodity === 'cafe') return normalized.includes('café') || normalized.includes('cafe');
  return false;
};

const buildValidQuote = (
  commodity: CommodityKey,
  sourceLabel: string,
  sourceUrl: string,
  row: { dateText: string; productText: string; priceText: string }
): ParsedMarketQuote | null => {
  const preco = parseBrazilianCurrency(row.priceText);
  const data_referencia = parseReferenceDate(row.dateText);

  if (!preco || preco <= 0 || !data_referencia || !row.productText) {
    return null;
  }

  return {
    commodity,
    produto: row.productText,
    preco,
    unidade: 'R$',
    data_referencia,
    fonte: sourceLabel,
    sourceUrl,
    rowPreview: row,
  };
};

export const fetchAndParseMarketQuote = async (source: MarketQuoteSourceRecord): Promise<ParsedMarketQuote> => {
  const finalUrl =
    source.provider === 'cepea'
      ? buildCepeaUrl(source.commodity_target, source.cepea_indicator_id)
      : source.source_url.trim();

  if (!finalUrl) {
    throw new Error('A fonte não possui uma URL válida para coleta.');
  }

  const response = await fetch(finalUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BWAGROMarketQuotesBot/1.0; +https://bwagro.com.br)',
      Accept: 'text/html,application/xhtml+xml,text/javascript',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const rows = extractTableRows(html);

  if (!rows.length) {
    throw new Error('Estrutura HTML inesperada: nenhuma linha de dados encontrada.');
  }

  const matchingRows =
    source.provider === 'cepea'
      ? rows.filter((row) => isLikelyCommodityRow(source.commodity_target, row.productText))
      : rows;

  const candidateRows = matchingRows.length > 0 ? matchingRows : rows;

  for (const row of candidateRows) {
    const parsed = buildValidQuote(
      source.commodity_target,
      source.provider === 'cepea' ? 'CEPEA' : source.provider_label || 'Referência de mercado',
      finalUrl,
      row
    );

    if (parsed) {
      return parsed;
    }
  }

  throw new Error('Dados insuficientes para validação: preço, produto ou data inválidos.');
};

export const updateSourceStatus = async (
  supabaseAdmin: any,
  sourceId: string,
  values: Record<string, unknown>
) => {
  await supabaseAdmin.from('market_quote_sources').update(values).eq('id', sourceId);
};

export const saveTempQuote = async (
  supabaseAdmin: any,
  source: MarketQuoteSourceRecord,
  parsed: ParsedMarketQuote
) => {
  const { data, error } = await supabaseAdmin
    .from('market_quotes_temp')
    .upsert(
      {
        source_id: source.id,
        commodity: parsed.commodity,
        produto: parsed.produto,
        preco: parsed.preco,
        unidade: parsed.unidade,
        data_referencia: parsed.data_referencia,
        fonte: parsed.fonte,
        status: 'pending',
        raw_payload: {
          provider: source.provider,
          sourceUrl: parsed.sourceUrl,
          dateText: parsed.rowPreview.dateText,
          productText: parsed.rowPreview.productText,
          priceText: parsed.rowPreview.priceText,
        },
        error_message: null,
      },
      { onConflict: 'source_id,commodity,data_referencia,preco' }
    )
    .select('*')
    .single();

  if (error) throw error;

  await updateSourceStatus(supabaseAdmin, source.id, {
    source_url: source.provider === 'cepea' ? parsed.sourceUrl : source.source_url,
    generated_url: source.provider === 'cepea' ? parsed.sourceUrl : source.generated_url,
    cepea_indicator_id:
      source.provider === 'cepea' ? source.cepea_indicator_id || cepeaIndicatorMap[source.commodity_target] : null,
    last_validation_at: new Date().toISOString(),
    last_status: 'active',
    last_error: null,
  });

  return data;
};
