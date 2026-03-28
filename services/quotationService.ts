import { Quotation } from '../types';
import { supabase } from '../src/lib/supabaseClient';

const CACHE_KEY = 'bwagro_quotations_cache';
const CACHE_EXPIRATION = 15 * 60 * 1000;
const BCB_BASE_URL = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

type BcbQuotationValue = {
  cotacaoCompra: number;
  cotacaoVenda: number;
  dataHoraCotacao: string;
};

type BcbQuotationResponse = {
  value?: BcbQuotationValue[];
};

type MarketQuoteRecord = {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  price: number | null;
  change_percent: number | null;
  is_active: boolean;
  sort_order: number | null;
  source: string | null;
  last_update: string | null;
  is_placeholder: boolean | null;
  placeholder_text: string | null;
};

const buildBcbDate = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
};

const formatCurrency = (value: number) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

const getTrend = (change: number): Quotation['trend'] => {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'stable';
};

const createPlaceholderCommodity = (
  id: string,
  name: string,
  unit: string,
  note: string,
  lastUpdate: string
): Quotation => ({
  id,
  name,
  value: note,
  unit,
  change: 0,
  trend: 'stable',
  lastUpdate,
});

const mapStoredQuoteToTickerItem = (record: MarketQuoteRecord): Quotation => {
  const value =
    record.is_placeholder || record.price === null
      ? record.placeholder_text || 'Em atualização'
      : formatCurrency(record.price);

  const change = Number((record.change_percent ?? 0).toFixed(2));

  return {
    id: record.code,
    name: record.name,
    value,
    unit: record.unit || '',
    change,
    trend: getTrend(change),
    lastUpdate: record.last_update || new Date().toISOString(),
  };
};

const getDefaultQuotations = (lastUpdate: string, dollarQuotation?: Quotation): Quotation[] => {
  const baseItems: Quotation[] = [
    createPlaceholderCommodity('cepea-soja', 'Soja (CEPEA)', 'Indicador físico', 'Fonte em implantação', lastUpdate),
    createPlaceholderCommodity('cepea-milho', 'Milho (CEPEA)', 'Indicador físico', 'Fonte em implantação', lastUpdate),
    createPlaceholderCommodity('cepea-boi', 'Boi Gordo (CEPEA)', 'Indicador físico', 'Fonte em implantação', lastUpdate),
    createPlaceholderCommodity('cepea-cafe', 'Café Arábica (CEPEA)', 'Indicador físico', 'Fonte em implantação', lastUpdate),
  ];

  return dollarQuotation ? [dollarQuotation, ...baseItems] : baseItems;
};

const fetchBcbQuoteByDate = async (date: Date): Promise<BcbQuotationValue | null> => {
  const bcbDate = buildBcbDate(date);
  const query = `${BCB_BASE_URL}/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${bcbDate}'&$top=1&$format=json`;
  const response = await fetch(query, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Falha ao consultar Banco Central: ${response.status}`);
  }

  const data = (await response.json()) as BcbQuotationResponse;
  return data.value?.[0] ?? null;
};

const fetchLatestBcbDollarQuotation = async (): Promise<Quotation> => {
  const attempts: BcbQuotationValue[] = [];
  const cursor = new Date();

  for (let offset = 0; offset < 10 && attempts.length < 2; offset += 1) {
    const candidateDate = new Date(cursor);
    candidateDate.setDate(cursor.getDate() - offset);

    const dailyQuote = await fetchBcbQuoteByDate(candidateDate);
    if (dailyQuote) {
      attempts.push(dailyQuote);
    }
  }

  if (attempts.length === 0) {
    throw new Error('Banco Central sem cotação disponível para os últimos dias.');
  }

  const [currentQuote, previousQuote] = attempts;
  const currentSellPrice = currentQuote.cotacaoVenda;
  const previousSellPrice = previousQuote?.cotacaoVenda ?? currentSellPrice;
  const variation = previousSellPrice
    ? Number((((currentSellPrice - previousSellPrice) / previousSellPrice) * 100).toFixed(2))
    : 0;

  return {
    id: 'usd-brl-bcb',
    name: 'Dólar Comercial',
    value: formatCurrency(currentSellPrice),
    unit: 'PTAX venda',
    change: variation,
    trend: getTrend(variation),
    lastUpdate: currentQuote.dataHoraCotacao,
  };
};

const fetchStoredQuotations = async (): Promise<Quotation[]> => {
  const { data, error } = await supabase
    .from('market_quotes')
    .select('id, code, name, unit, price, change_percent, is_active, sort_order, source, last_update, is_placeholder, placeholder_text')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    throw error;
  }

  return ((data as MarketQuoteRecord[] | null) || []).map(mapStoredQuoteToTickerItem);
};

const mergeDollarWithStoredQuotes = (storedQuotes: Quotation[], dollarQuotation: Quotation) => {
  const filteredQuotes = storedQuotes.filter((item) => item.id !== 'usd-brl-bcb' && item.name !== 'Dólar Comercial');
  return [dollarQuotation, ...filteredQuotes];
};

const fetchExternalQuotations = async (): Promise<Quotation[]> => {
  const lastUpdate = new Date().toISOString();
  const dollarQuotation = await fetchLatestBcbDollarQuotation();

  try {
    const storedQuotes = await fetchStoredQuotations();
    if (storedQuotes.length > 0) {
      return mergeDollarWithStoredQuotes(storedQuotes, dollarQuotation);
    }
  } catch (error) {
    console.warn('[QuotationService] Não foi possível carregar market_quotes; usando fallback local.', error);
  }

  return getDefaultQuotations(lastUpdate, dollarQuotation);
};

export const getQuotations = async (): Promise<Quotation[]> => {
  const cached = localStorage.getItem(CACHE_KEY);

  if (cached) {
    const { data, timestamp } = JSON.parse(cached) as { data: Quotation[]; timestamp: number };
    const isExpired = Date.now() - timestamp > CACHE_EXPIRATION;

    if (!isExpired) {
      return data;
    }
  }

  try {
    const freshData = await fetchExternalQuotations();
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data: freshData,
        timestamp: Date.now(),
      })
    );
    return freshData;
  } catch (error) {
    console.error('Erro ao sincronizar cotações:', error);
    return cached ? (JSON.parse(cached).data as Quotation[]) : [];
  }
};
