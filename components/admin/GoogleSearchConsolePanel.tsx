import React, { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, CircleAlert, ExternalLink, Eye, FileSearch, Gauge, Globe2, MonitorSmartphone, MousePointerClick, RefreshCw, Search, ShieldCheck, Smartphone, Target } from 'lucide-react';
import { inspectGoogleSearchUrl, runGooglePageSpeed, useGoogleSearchConsole, type GooglePageSpeedResult, type GoogleUrlInspection } from '../../src/hooks/useGoogleSearchConsole';
import type { AnalyticsPeriod } from '../../src/hooks/useAdminSiteAnalytics';

const numberFormatter = new Intl.NumberFormat('pt-BR');
const percentFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 2 });
const decimalFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const signedFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
const bytesFormatter = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

const deviceLabels: Record<string, string> = { DESKTOP: 'Desktop', MOBILE: 'Celular', TABLET: 'Tablet' };
const countryNames = new Intl.DisplayNames(['pt-BR'], { type: 'region' });
const alpha3ToAlpha2: Record<string, string> = {
  ARG: 'AR', BRA: 'BR', CAN: 'CA', CHL: 'CL', COL: 'CO', DEU: 'DE', ESP: 'ES',
  FRA: 'FR', GBR: 'GB', ITA: 'IT', MEX: 'MX', PRT: 'PT', USA: 'US',
};

const formatCountry = (value: string) => {
  const code = value.trim().toUpperCase();
  try {
    return countryNames.of(alpha3ToAlpha2[code] || code) || code;
  } catch {
    return code || 'Não informado';
  }
};

const formatSearchPage = (value: string) => {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return value;
  }
};

const comparisonTone = (value: number | null, inverse = false) => {
  if (value === null || value === 0) return 'text-slate-500';
  const positive = inverse ? value < 0 : value > 0;
  return positive ? 'text-emerald-700' : 'text-rose-700';
};

const verdictLabel = (value: string | null) => ({
  PASS: 'Aprovado',
  FAIL: 'Reprovado',
  NEUTRAL: 'Neutro',
  VERDICT_UNSPECIFIED: 'Não informado',
}[value || ''] || value || 'Não informado');

const formatDate = (value: string) => {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
    .format(new Date(`${value}T12:00:00Z`));
};

const scoreTone = (score: number | null) => score === null
  ? 'bg-slate-100 text-slate-600'
  : score >= 90 ? 'bg-emerald-50 text-emerald-800' : score >= 50 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800';

const metricTone = (value: number | null, good: number, warning: number) => value === null
  ? 'text-slate-500' : value <= good ? 'text-emerald-700' : value <= warning ? 'text-amber-700' : 'text-rose-700';

const MetricCard: React.FC<{
  title: string;
  value: string;
  helper: string;
  icon: React.ReactNode;
  accent: string;
}> = ({ title, value, helper, icon, accent }) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.3)]">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">{title}</p>
        <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
        <p className="mt-2 text-sm text-slate-500">{helper}</p>
      </div>
      <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${accent}`}>{icon}</div>
    </div>
  </div>
);

const GoogleSearchConsolePanel: React.FC<{ period: AnalyticsPeriod }> = ({ period }) => {
  const { data, isLoading, error, refresh } = useGoogleSearchConsole(period);
  const [inspectionUrl, setInspectionUrl] = useState('https://agrobw.com.br/');
  const [inspection, setInspection] = useState<GoogleUrlInspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [pageSpeedUrl, setPageSpeedUrl] = useState('https://agrobw.com.br/');
  const [pageSpeedStrategy, setPageSpeedStrategy] = useState<'mobile' | 'desktop'>('mobile');
  const [pageSpeed, setPageSpeed] = useState<GooglePageSpeedResult | null>(null);
  const [pageSpeedError, setPageSpeedError] = useState<string | null>(null);
  const [isAnalyzingSpeed, setIsAnalyzingSpeed] = useState(false);
  const maxImpressions = useMemo(
    () => Math.max(1, ...(data?.series.map((item) => item.impressions) || [1])),
    [data?.series],
  );
  const monitorIssues = useMemo(
    () => data?.indexMonitor.items.filter((item) => item.health !== 'healthy').slice(0, 4) || [],
    [data?.indexMonitor.items],
  );
  const pageSpeedSuggestions = useMemo(() => {
    const suggestions = [{ url: 'https://agrobw.com.br/', label: 'Home' }];
    const seenTypes = new Set<string>();
    for (const item of data?.indexMonitor.items || []) {
      if (seenTypes.has(item.type)) continue;
      seenTypes.add(item.type);
      suggestions.push({ url: item.url, label: item.label });
    }
    return suggestions;
  }, [data?.indexMonitor.items]);

  const runInspection = async () => {
    setIsInspecting(true);
    setInspectionError(null);
    try {
      setInspection(await inspectGoogleSearchUrl(inspectionUrl));
    } catch (caughtError) {
      setInspection(null);
      setInspectionError(caughtError instanceof Error ? caughtError.message : 'Não foi possível inspecionar esta URL.');
    } finally {
      setIsInspecting(false);
    }
  };

  const analyzePageSpeed = async () => {
    setIsAnalyzingSpeed(true);
    setPageSpeedError(null);
    try {
      setPageSpeed(await runGooglePageSpeed(pageSpeedUrl, pageSpeedStrategy));
    } catch (caughtError) {
      setPageSpeed(null);
      setPageSpeedError(caughtError instanceof Error ? caughtError.message : 'Não foi possível analisar esta página.');
    } finally {
      setIsAnalyzingSpeed(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="h-36 animate-pulse rounded-[28px] bg-slate-100" />
        ))}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-[28px] border border-rose-200 bg-rose-50 p-6">
        <p className="font-bold text-rose-800">Não foi possível carregar os dados do Google.</p>
        <p className="mt-2 text-sm text-rose-700">{error}</p>
        <button type="button" onClick={() => void refresh()} className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white">
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-[24px] border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-bold">Dados oficiais do Google Search Console</p>
          <p className="mt-1 text-sky-700">
            Período de {formatDate(data.period.startDate)} a {formatDate(data.period.endDate)}. O Google normalmente consolida estes dados com atraso de até {data.period.dataDelayDays} dias.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={isLoading} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-4 font-bold text-sky-800 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar Google
        </button>
      </div>

      {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">A atualização falhou; exibindo os últimos dados carregados.</div> : null}
      {data.partial ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Os indicadores principais estão atualizados, mas uma ou mais consultas complementares do Google ficaram temporariamente indisponíveis.</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Cliques" value={numberFormatter.format(data.summary.clicks)} helper="Visitas recebidas pela Busca Google" icon={<MousePointerClick className="h-5 w-5 text-emerald-700" />} accent="bg-emerald-50" />
        <MetricCard title="Impressões" value={numberFormatter.format(data.summary.impressions)} helper="Vezes que o site apareceu na busca" icon={<Eye className="h-5 w-5 text-sky-700" />} accent="bg-sky-50" />
        <MetricCard title="CTR médio" value={percentFormatter.format(data.summary.ctr)} helper="Cliques divididos por impressões" icon={<Target className="h-5 w-5 text-amber-700" />} accent="bg-amber-50" />
        <MetricCard title="Posição média" value={decimalFormatter.format(data.summary.position)} helper="Posição média nos resultados" icon={<BarChart3 className="h-5 w-5 text-violet-700" />} accent="bg-violet-50" />
      </div>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr]">
          <div className="border-b border-slate-200 p-6 lg:border-b-0 lg:border-r">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">Comparativo</p>
            <h3 className="mt-2 text-lg font-black text-slate-950">Período anterior</h3>
            {data.comparison.available && data.comparison.changes ? (
              <div className="mt-5 grid grid-cols-3 gap-3">
                <div><p className={`text-xl font-black ${comparisonTone(data.comparison.changes.clicksPercent)}`}>{data.comparison.changes.clicksPercent === null ? '-' : `${signedFormatter.format(data.comparison.changes.clicksPercent)}%`}</p><p className="mt-1 text-xs text-slate-500">Cliques</p></div>
                <div><p className={`text-xl font-black ${comparisonTone(data.comparison.changes.impressionsPercent)}`}>{data.comparison.changes.impressionsPercent === null ? '-' : `${signedFormatter.format(data.comparison.changes.impressionsPercent)}%`}</p><p className="mt-1 text-xs text-slate-500">Impressões</p></div>
                <div><p className={`text-xl font-black ${comparisonTone(data.comparison.changes.position)}`}>{data.comparison.changes.position === null ? '-' : signedFormatter.format(data.comparison.changes.position)}</p><p className="mt-1 text-xs text-slate-500">Posições</p></div>
              </div>
            ) : <p className="mt-5 text-sm text-slate-500">O Google ainda não possui dados suficientes para comparar.</p>}
          </div>

          <div className="p-6">
            <div className="flex items-center justify-between gap-4">
              <div><p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-700">Oportunidades SEO</p><h3 className="mt-2 text-lg font-black text-slate-950">Próximas ações</h3></div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">máx. 5</span>
            </div>
            {data.opportunities.length > 0 ? (
              <div className="mt-4 divide-y divide-slate-100">
                {data.opportunities.map((item) => (
                  <div key={`${item.kind}:${item.target}`} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${item.priority === 'high' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                    <div className="min-w-0"><p className="font-bold text-slate-900">{item.title}</p><p className="mt-0.5 break-words text-sm text-slate-600">{item.target}</p><p className="mt-1 text-xs text-slate-400">{item.detail}</p></div>
                  </div>
                ))}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">Nenhuma oportunidade relevante detectada com o volume atual.</p>}
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-700">Monitor de indexação</p><h3 className="mt-1 text-lg font-black text-slate-950">Conteúdos prioritários</h3><p className="mt-1 text-sm text-slate-500">Últimos anúncios, notícias e lojas verificados automaticamente.</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="min-w-[92px] rounded-2xl bg-emerald-50 px-4 py-3"><p className="text-xl font-black text-emerald-800">{data.indexMonitor.healthy}</p><p className="text-xs font-bold text-emerald-700">Saudáveis</p></div>
            <div className="min-w-[92px] rounded-2xl bg-amber-50 px-4 py-3"><p className="text-xl font-black text-amber-800">{data.indexMonitor.attention}</p><p className="text-xs font-bold text-amber-700">Atenção</p></div>
            <div className="min-w-[92px] rounded-2xl bg-rose-50 px-4 py-3"><p className="text-xl font-black text-rose-800">{data.indexMonitor.critical}</p><p className="text-xs font-bold text-rose-700">Críticos</p></div>
          </div>
        </div>
        {monitorIssues.length > 0 ? (
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {monitorIssues.map((item) => (
              <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white">
                {item.health === 'critical' ? <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" /> : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />}
                <div className="min-w-0"><p className="truncate font-bold text-slate-900">{item.label}</p><p className="mt-1 text-sm text-slate-600">{item.issue}</p></div>
              </a>
            ))}
          </div>
        ) : data.indexMonitor.checked > 0 ? (
          <div className="mt-5 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Nenhum problema detectado nas {data.indexMonitor.checked} URLs verificadas.</div>
        ) : (
          <p className="mt-5 text-sm text-slate-500">Ainda não há conteúdos elegíveis para monitorar.</p>
        )}
        <p className="mt-3 text-xs text-slate-400">Verificação: {new Date(data.indexMonitor.checkedAt).toLocaleString('pt-BR')}{data.indexMonitor.partial ? ' · resultado parcial' : ''}</p>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700"><Gauge className="h-5 w-5" /></div>
            <div><p className="text-[11px] font-black uppercase tracking-[0.28em] text-sky-700">PageSpeed Insights</p><h3 className="mt-1 text-lg font-black text-slate-950">Desempenho da página</h3><p className="mt-1 text-sm text-slate-500">Análise sob demanda para não consumir cota nem atrasar o painel.</p></div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <input list="pagespeed-targets" value={pageSpeedUrl} onChange={(event) => setPageSpeedUrl(event.target.value)} className="h-11 min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none focus:border-sky-400 md:w-[360px]" placeholder="https://agrobw.com.br/..." />
            <datalist id="pagespeed-targets">{pageSpeedSuggestions.map((item) => <option key={item.url} value={item.url}>{item.label}</option>)}</datalist>
            <div className="flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
              {(['mobile', 'desktop'] as const).map((strategy) => <button key={strategy} type="button" onClick={() => setPageSpeedStrategy(strategy)} className={`rounded-xl px-3 py-2 text-xs font-bold ${pageSpeedStrategy === strategy ? 'bg-slate-950 text-white' : 'text-slate-600'}`}>{strategy === 'mobile' ? 'Celular' : 'Desktop'}</button>)}
            </div>
            <button type="button" onClick={() => void analyzePageSpeed()} disabled={isAnalyzingSpeed} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-sky-600 px-4 text-sm font-black text-white disabled:opacity-60"><Gauge className={`h-4 w-4 ${isAnalyzingSpeed ? 'animate-pulse' : ''}`} />{isAnalyzingSpeed ? 'Analisando...' : 'Analisar'}</button>
          </div>
        </div>
        {pageSpeedError ? <p className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{pageSpeedError}</p> : null}
        {pageSpeed ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Desempenho', pageSpeed.scores.performance], ['Acessibilidade', pageSpeed.scores.accessibility],
                ['Boas práticas', pageSpeed.scores.bestPractices], ['SEO técnico', pageSpeed.scores.seo],
              ].map(([label, score]) => <div key={String(label)} className={`rounded-2xl px-4 py-4 ${scoreTone(score as number | null)}`}><p className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</p><p className="mt-2 text-3xl font-black">{score ?? '-'}</p></div>)}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500">LCP laboratório</p><p className={`mt-2 text-xl font-black ${metricTone(pageSpeed.lab.lcpMs, 2500, 4000)}`}>{pageSpeed.lab.lcpMs === null ? '-' : `${(pageSpeed.lab.lcpMs / 1000).toFixed(1)} s`}</p></div>
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500">CLS laboratório</p><p className={`mt-2 text-xl font-black ${metricTone(pageSpeed.lab.cls, 0.1, 0.25)}`}>{pageSpeed.lab.cls === null ? '-' : pageSpeed.lab.cls.toFixed(3)}</p></div>
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500">INP real</p><p className={`mt-2 text-xl font-black ${metricTone(pageSpeed.field.inp?.value ?? null, 200, 500)}`}>{pageSpeed.field.inp?.value == null ? 'Sem dados' : `${pageSpeed.field.inp.value} ms`}</p></div>
              <div className="rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-slate-500">Bloqueio total</p><p className={`mt-2 text-xl font-black ${metricTone(pageSpeed.lab.tbtMs, 200, 600)}`}>{pageSpeed.lab.tbtMs === null ? '-' : `${Math.round(pageSpeed.lab.tbtMs)} ms`}</p></div>
            </div>
            {pageSpeed.recommendations.length > 0 ? <div><p className="text-sm font-black text-slate-900">Prioridades de melhoria</p><div className="mt-2 grid gap-2 lg:grid-cols-2">{pageSpeed.recommendations.map((item) => <div key={item.id} className="rounded-2xl bg-slate-50 px-4 py-3"><p className="font-bold text-slate-900">{item.title}</p><p className="mt-1 text-xs text-slate-500">{item.displayValue || [item.savingsMs ? `${item.savingsMs} ms` : '', item.savingsBytes ? `${bytesFormatter.format(item.savingsBytes / 1024)} KB` : ''].filter(Boolean).join(' · ')}</p></div>)}</div></div> : <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Nenhuma prioridade importante detectada.</div>}
            <p className="flex items-center gap-2 text-xs text-slate-400"><Smartphone className="h-3.5 w-3.5" /> {pageSpeed.strategy === 'mobile' ? 'Celular' : 'Desktop'} · analisado em {new Date(pageSpeed.analyzedAt).toLocaleString('pt-BR')}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Evolução no Google</p>
        <h3 className="mt-2 text-lg font-black text-slate-950">Impressões e cliques por dia</h3>
        {data.series.length === 0 ? (
          <p className="mt-5 text-sm text-slate-500">Ainda não há dados consolidados neste período.</p>
        ) : (
          <div className="mt-6 space-y-3">
            {data.series.map((item) => (
              <div key={item.date} className="grid grid-cols-[58px_1fr_90px_76px] items-center gap-3">
                <span className="text-xs font-bold text-slate-500">{formatDate(item.date)}</span>
                <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[linear-gradient(90deg,#16a34a_0%,#0284c7_100%)]" style={{ width: `${Math.max(3, (item.impressions / maxImpressions) * 100)}%` }} />
                </div>
                <span className="text-right text-sm font-semibold text-slate-700">{numberFormatter.format(item.impressions)} imp.</span>
                <span className="text-right text-xs font-bold text-emerald-700">{numberFormatter.format(item.clicks)} cliques</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
          <div className="flex items-center gap-3"><Search className="h-5 w-5 text-emerald-700" /><h3 className="text-lg font-black text-slate-950">Principais consultas</h3></div>
          <p className="mt-1 text-sm text-slate-500">Termos usados no Google para encontrar o portal.</p>
          <div className="mt-5 space-y-3">
            {data.topQueries.map((item) => (
              <div key={item.query} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="font-semibold text-slate-900">{item.query || '(consulta não informada)'}</p>
                <div className="shrink-0 text-right"><p className="font-black text-slate-950">{numberFormatter.format(item.clicks)}</p><p className="text-xs text-slate-500">cliques</p></div>
              </div>
            ))}
            {data.topQueries.length === 0 ? <p className="text-sm text-slate-500">Sem consultas no período.</p> : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
          <div className="flex items-center gap-3"><Eye className="h-5 w-5 text-sky-700" /><h3 className="text-lg font-black text-slate-950">Páginas na busca</h3></div>
          <p className="mt-1 text-sm text-slate-500">Páginas que mais apareceram nos resultados.</p>
          <div className="mt-5 space-y-3">
            {data.topPages.map((item) => (
              <div key={item.page} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="min-w-0 break-all font-semibold text-slate-900" title={item.page}>{formatSearchPage(item.page)}</p>
                <div className="shrink-0 text-right"><p className="font-black text-slate-950">{numberFormatter.format(item.impressions)}</p><p className="text-xs text-slate-500">impressões</p></div>
              </div>
            ))}
            {data.topPages.length === 0 ? <p className="text-sm text-slate-500">Sem páginas no período.</p> : null}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
          <div className="flex items-center gap-3"><MonitorSmartphone className="h-5 w-5 text-violet-700" /><h3 className="text-lg font-black text-slate-950">Dispositivos</h3></div>
          <p className="mt-1 text-sm text-slate-500">Como as pessoas encontram o portal.</p>
          <div className="mt-5 space-y-3">
            {data.devices.map((item) => (
              <div key={item.device} className="flex justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <div><p className="font-semibold text-slate-900">{deviceLabels[item.device] || item.device}</p><p className="text-xs text-slate-500">Posição {decimalFormatter.format(item.position)}</p></div>
                <div className="text-right"><p className="font-black text-slate-950">{numberFormatter.format(item.clicks)}</p><p className="text-xs text-slate-500">{numberFormatter.format(item.impressions)} impressões</p></div>
              </div>
            ))}
            {data.devices.length === 0 ? <p className="text-sm text-slate-500">Sem dados por dispositivo.</p> : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
          <div className="flex items-center gap-3"><Globe2 className="h-5 w-5 text-sky-700" /><h3 className="text-lg font-black text-slate-950">Países</h3></div>
          <p className="mt-1 text-sm text-slate-500">Origem geográfica das pesquisas.</p>
          <div className="mt-5 space-y-3">
            {data.countries.map((item) => (
              <div key={item.country} className="flex justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="font-semibold text-slate-900">{formatCountry(item.country)}</p>
                <div className="text-right"><p className="font-black text-slate-950">{numberFormatter.format(item.clicks)}</p><p className="text-xs text-slate-500">{numberFormatter.format(item.impressions)} impressões</p></div>
              </div>
            ))}
            {data.countries.length === 0 ? <p className="text-sm text-slate-500">Sem dados por país.</p> : null}
          </div>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
          <div className="flex items-center gap-3"><Search className="h-5 w-5 text-emerald-700" /><h3 className="text-lg font-black text-slate-950">Tipos de pesquisa</h3></div>
          <p className="mt-1 text-sm text-slate-500">Web, imagens, vídeos e notícias.</p>
          <div className="mt-5 space-y-3">
            {data.searchTypes.filter((item) => item.metric.impressions > 0 || item.type === 'web').map((item) => (
              <div key={item.type} className="flex justify-between rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="font-semibold text-slate-900">{item.label}</p>
                <div className="text-right"><p className="font-black text-slate-950">{numberFormatter.format(item.metric.clicks)}</p><p className="text-xs text-slate-500">{numberFormatter.format(item.metric.impressions)} impressões</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {data.searchAppearances.length > 0 ? (
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
          <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Aparência na pesquisa</p>
          <h3 className="mt-2 text-lg font-black text-slate-950">Recursos especiais detectados pelo Google</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.searchAppearances.map((item) => (
              <div key={item.appearance} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="font-semibold text-slate-900">{item.appearance}</p>
                <p className="mt-1 text-xs text-slate-500">{numberFormatter.format(item.clicks)} cliques · {numberFormatter.format(item.impressions)} impressões</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-700" /><h3 className="text-lg font-black text-slate-950">Sitemaps reconhecidos pelo Google</h3></div>
        <p className="mt-1 text-sm text-slate-500">Última leitura e quantidade de URLs enviadas/indexadas informadas pela API.</p>
        <div className="mt-5 space-y-3">
          {data.sitemaps.map((sitemap) => {
            const submitted = sitemap.contents.reduce((sum, item) => sum + item.submitted, 0);
            const indexed = sitemap.contents.reduce((sum, item) => sum + item.indexed, 0);
            return (
              <div key={sitemap.path} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4 lg:grid-cols-[1fr_auto_auto_auto] lg:items-center">
                <div><p className="break-all font-semibold text-slate-900">{sitemap.path}</p><p className="mt-1 text-xs text-slate-500">Última leitura: {sitemap.lastDownloaded ? new Date(sitemap.lastDownloaded).toLocaleString('pt-BR') : 'não informada'}</p></div>
                <div className="text-sm"><span className="font-black text-slate-950">{submitted}</span> enviadas</div>
                <div className="text-sm"><span className="font-black text-emerald-700">{indexed}</span> indexadas</div>
                <div className={`rounded-full px-3 py-1 text-xs font-bold ${sitemap.errors > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{sitemap.errors} erros · {sitemap.warnings} avisos</div>
              </div>
            );
          })}
          {data.sitemaps.length === 0 ? <p className="text-sm text-slate-500">Nenhum sitemap retornado pela API.</p> : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#172554_100%)] p-6 text-white shadow-[0_24px_70px_-40px_rgba(15,23,42,0.8)]">
        <div className="flex items-center gap-3"><FileSearch className="h-5 w-5 text-emerald-300" /><h3 className="text-lg font-black">Inspecionar URL no índice do Google</h3></div>
        <p className="mt-1 text-sm text-slate-300">Consulte uma página do agrobw.com.br para ver indexação, último rastreamento, canonical e resultados avançados.</p>
        <div className="mt-5 flex flex-col gap-3 md:flex-row">
          <input value={inspectionUrl} onChange={(event) => setInspectionUrl(event.target.value)} className="h-12 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-slate-400 focus:border-emerald-400" placeholder="https://agrobw.com.br/anuncio/..." />
          <button type="button" onClick={() => void runInspection()} disabled={isInspecting} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-5 font-black text-slate-950 disabled:opacity-60"><FileSearch className="h-4 w-4" />{isInspecting ? 'Consultando...' : 'Inspecionar URL'}</button>
        </div>
        {inspectionError ? <p className="mt-4 rounded-xl bg-rose-500/15 px-4 py-3 text-sm text-rose-200">{inspectionError}</p> : null}
        {inspection ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Indexação</p><p className="mt-2 font-black">{verdictLabel(inspection.index.verdict)}</p><p className="mt-1 text-xs text-slate-300">{inspection.index.coverageState || 'Estado não informado'}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Último rastreamento</p><p className="mt-2 font-black">{inspection.index.lastCrawlTime ? new Date(inspection.index.lastCrawlTime).toLocaleString('pt-BR') : 'Não informado'}</p><p className="mt-1 text-xs text-slate-300">{inspection.index.crawledAs || ''}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Uso em dispositivos móveis</p><p className="mt-2 font-black">{verdictLabel(inspection.mobile.verdict)}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Resultados avançados</p><p className="mt-2 font-black">{verdictLabel(inspection.richResults.verdict)}</p><p className="mt-1 text-xs text-slate-300">{inspection.richResults.detectedItems.map((item) => item.richResultType).filter(Boolean).join(', ') || 'Nenhum tipo informado'}</p></div>
            <div className="rounded-2xl bg-white/10 p-4 md:col-span-2"><p className="text-xs uppercase tracking-wider text-slate-400">Canonical declarado</p><p className="mt-2 break-all text-sm font-semibold">{inspection.index.userCanonical || 'Não informado'}</p></div>
            <div className="rounded-2xl bg-white/10 p-4 md:col-span-2"><p className="text-xs uppercase tracking-wider text-slate-400">Canonical escolhido pelo Google</p><p className="mt-2 break-all text-sm font-semibold">{inspection.index.googleCanonical || 'Não informado'}</p></div>
            {inspection.inspectionResultLink ? <a href={inspection.inspectionResultLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 hover:text-emerald-200 md:col-span-2 xl:col-span-4">Abrir detalhes no Search Console <ExternalLink className="h-4 w-4" /></a> : null}
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default GoogleSearchConsolePanel;
