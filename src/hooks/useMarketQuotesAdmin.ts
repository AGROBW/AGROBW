import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export type CommodityTarget = 'soja' | 'milho' | 'boi' | 'cafe';
export type SourceProvider = 'cepea' | 'custom';

export type AdminMarketQuoteSource = {
  id: string;
  name: string;
  source_url: string;
  commodity_target: CommodityTarget;
  provider: SourceProvider;
  cepea_indicator_id: number | null;
  generated_url: string | null;
  provider_label: string | null;
  is_active: boolean;
  refresh_interval_minutes: number;
  last_validation_at: string | null;
  last_sync_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminMarketQuoteTempItem = {
  id: string;
  source_id: string;
  commodity: CommodityTarget;
  produto: string;
  preco: number;
  unidade: string;
  data_referencia: string;
  fonte: string;
  status: 'pending' | 'approved' | 'rejected';
  raw_payload: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
};

export type AdminMarketQuotePublishedItem = {
  code: string;
  source_id: string | null;
  commodity: CommodityTarget | null;
  product_name: string | null;
  price: number;
  reference_date: string | null;
  source_label: string | null;
  updated_at?: string | null;
  last_update?: string | null;
};

type SourcePayload = {
  id?: string;
  name: string;
  source_url: string;
  commodity_target: CommodityTarget;
  provider: SourceProvider;
  provider_label?: string | null;
  is_active: boolean;
  refresh_interval_minutes: number;
};

const cepeaIndicatorMap: Record<CommodityTarget, number> = {
  boi: 2,
  cafe: 23,
  milho: 77,
  soja: 12,
};

const cepeaNameMap: Record<CommodityTarget, string> = {
  boi: 'Boi Gordo',
  cafe: 'Café Arábica',
  milho: 'Milho',
  soja: 'Soja',
};

const quoteDefinitions = {
  soja: { code: 'cepea-soja', name: 'Soja (CEPEA)', sortOrder: 10 },
  milho: { code: 'cepea-milho', name: 'Milho (CEPEA)', sortOrder: 20 },
  boi: { code: 'cepea-boi', name: 'Boi Gordo (CEPEA)', sortOrder: 30 },
  cafe: { code: 'cepea-cafe', name: 'Café Arábica (CEPEA)', sortOrder: 40 },
} as const;

const buildCepeaUrl = (commodity: CommodityTarget) =>
  `https://www.cepea.org.br/br/widgetproduto.js.php?output=html&id_indicador[]=${cepeaIndicatorMap[commodity]}`;

export const useMarketQuotesAdmin = () => {
  const [sources, setSources] = useState<AdminMarketQuoteSource[]>([]);
  const [latestTempBySource, setLatestTempBySource] = useState<Record<string, AdminMarketQuoteTempItem | null>>({});
  const [tempHistoryBySource, setTempHistoryBySource] = useState<Record<string, AdminMarketQuoteTempItem[]>>({});
  const [publishedQuoteBySource, setPublishedQuoteBySource] = useState<Record<string, AdminMarketQuotePublishedItem | null>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState<string | null>(null);
  const [isRejecting, setIsRejecting] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    setIsLoading(true);

    const [sourcesResult, tempResult, publishedResult] = await Promise.all([
      supabase.from('market_quote_sources').select('*').order('updated_at', { ascending: false }),
      supabase.from('market_quotes_temp').select('*').order('created_at', { ascending: false }),
      supabase
        .from('market_quotes')
        .select('code, source_id, commodity, product_name, price, reference_date, source_label, updated_at, last_update')
        .like('code', 'cepea-%')
        .order('sort_order', { ascending: true }),
    ]);

    if (sourcesResult.error) throw sourcesResult.error;
    if (tempResult.error) throw tempResult.error;
    if (publishedResult.error) throw publishedResult.error;

    const latestMap: Record<string, AdminMarketQuoteTempItem | null> = {};
    const historyMap: Record<string, AdminMarketQuoteTempItem[]> = {};
    const publishedMap: Record<string, AdminMarketQuotePublishedItem | null> = {};
    for (const item of (tempResult.data as AdminMarketQuoteTempItem[]) || []) {
      if (!latestMap[item.source_id]) latestMap[item.source_id] = item;
      if (!historyMap[item.source_id]) historyMap[item.source_id] = [];
      if (historyMap[item.source_id].length < 5) {
        historyMap[item.source_id].push(item);
      }
    }

    for (const item of (publishedResult.data as AdminMarketQuotePublishedItem[]) || []) {
      if (item.source_id) {
        publishedMap[item.source_id] = item;
      }
    }

    setSources((sourcesResult.data as AdminMarketQuoteSource[]) || []);
    setLatestTempBySource(latestMap);
    setTempHistoryBySource(historyMap);
    setPublishedQuoteBySource(publishedMap);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchSources().catch((error) => {
      console.error('[useMarketQuotesAdmin] Erro ao carregar cotações de mercado:', error);
      setIsLoading(false);
    });
  }, [fetchSources]);

  const saveSource = useCallback(
    async (payload: SourcePayload) => {
      setIsSaving(true);

      const cepeaIndicatorId = payload.provider === 'cepea' ? cepeaIndicatorMap[payload.commodity_target] : null;
      const resolvedUrl = payload.provider === 'cepea' ? buildCepeaUrl(payload.commodity_target) : payload.source_url;

      const values = {
        name: payload.name,
        source_url: resolvedUrl,
        commodity_target: payload.commodity_target,
        provider: payload.provider,
        cepea_indicator_id: cepeaIndicatorId,
        generated_url: payload.provider === 'cepea' ? resolvedUrl : null,
        provider_label: payload.provider_label ?? (payload.provider === 'cepea' ? 'CEPEA' : null),
        is_active: payload.is_active,
        refresh_interval_minutes: payload.refresh_interval_minutes,
      };

      const operation = payload.id
        ? supabase.from('market_quote_sources').update(values).eq('id', payload.id)
        : supabase.from('market_quote_sources').insert(values);

      const { error } = await operation;
      setIsSaving(false);

      if (error) throw error;
      await fetchSources();
    },
    [fetchSources]
  );

  const validateSource = useCallback(
    async (source: AdminMarketQuoteSource) => {
      setIsValidating(source.id);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setIsValidating(null);
        throw new Error('Sua sessão expirou. Entre novamente para validar a fonte.');
      }

      const { data, error } = await supabase.functions.invoke('validate-market-quote-source', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: {
          sourceId: source.id,
          provider: source.provider,
          url: source.source_url,
          commodity: source.commodity_target,
          cepeaIndicatorId: source.cepea_indicator_id,
        },
      });

      setIsValidating(null);

      if (error) throw error;

      await fetchSources();
      return data;
    },
    [fetchSources]
  );

  const publishTempItem = useCallback(
    async (source: AdminMarketQuoteSource) => {
      const tempItem = latestTempBySource[source.id];
      if (!tempItem) {
        throw new Error('Nenhum item em validação disponível para publicar.');
      }

      setIsPublishing(source.id);

      const definition = quoteDefinitions[tempItem.commodity];

      const { data: previousQuote, error: previousError } = await supabase
        .from('market_quotes')
        .select('price, source_id, source_label, reference_date')
        .eq('code', definition.code)
        .maybeSingle();

      if (previousError) {
        setIsPublishing(null);
        throw previousError;
      }

      const previousPrice = Number(previousQuote?.price || 0);
      const currentPrice = Number(tempItem.preco || 0);
      const hasTrustedBaseline =
        previousPrice > 0 &&
        !!previousQuote?.source_id &&
        previousQuote.source_id === source.id &&
        !!previousQuote?.reference_date &&
        previousQuote.source_label === tempItem.fonte;

      const variation = hasTrustedBaseline
        ? Number((((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2))
        : 0;

      const { error: quoteError } = await supabase.from('market_quotes').upsert(
        {
          code: definition.code,
          name: definition.name,
          commodity: tempItem.commodity,
          product_name: tempItem.produto,
          unit: tempItem.unidade,
          price: currentPrice,
          change_percent: variation,
          source: tempItem.fonte,
          source_label: tempItem.fonte,
          source_id: source.id,
          reference_date: tempItem.data_referencia,
          is_active: true,
          is_placeholder: false,
          placeholder_text: null,
          sort_order: definition.sortOrder,
          last_update: new Date().toISOString(),
        },
        { onConflict: 'code' }
      );

      if (quoteError) {
        setIsPublishing(null);
        throw quoteError;
      }

      const [{ error: tempError }, { error: sourceError }] = await Promise.all([
        supabase
          .from('market_quotes_temp')
          .update({
            status: 'approved',
            approved_at: new Date().toISOString(),
          })
          .eq('id', tempItem.id),
        supabase
          .from('market_quote_sources')
          .update({
            last_sync_at: new Date().toISOString(),
            last_status: 'active',
            last_error: null,
          })
          .eq('id', source.id),
      ]);

      setIsPublishing(null);

      if (tempError) throw tempError;
      if (sourceError) throw sourceError;

      await fetchSources();
    },
    [fetchSources, latestTempBySource]
  );

  const rejectTempItem = useCallback(
    async (source: AdminMarketQuoteSource) => {
      const tempItem = latestTempBySource[source.id];
      if (!tempItem) {
        throw new Error('Nenhum item em validação disponível para rejeitar.');
      }

      setIsRejecting(source.id);

      const [{ error: tempError }, { error: sourceError }] = await Promise.all([
        supabase
          .from('market_quotes_temp')
          .update({
            status: 'rejected',
            error_message: 'Rejeitado manualmente no painel administrativo.',
          })
          .eq('id', tempItem.id),
        supabase
          .from('market_quote_sources')
          .update({
            last_status: 'no_data',
            last_error: 'Última coleta rejeitada manualmente pelo admin.',
          })
          .eq('id', source.id),
      ]);

      setIsRejecting(null);

      if (tempError) throw tempError;
      if (sourceError) throw sourceError;

      await fetchSources();
    },
    [fetchSources, latestTempBySource]
  );

  const deleteSource = useCallback(
    async (sourceId: string) => {
      const { error } = await supabase.from('market_quote_sources').delete().eq('id', sourceId);
      if (error) throw error;
      await fetchSources();
    },
    [fetchSources]
  );

  return {
    cepeaIndicatorMap,
    cepeaNameMap,
    sources,
    latestTempBySource,
    tempHistoryBySource,
    publishedQuoteBySource,
    isLoading,
    isSaving,
    isValidating,
    isPublishing,
    isRejecting,
    saveSource,
    validateSource,
    publishTempItem,
    rejectTempItem,
    deleteSource,
    refresh: fetchSources,
  };
};
