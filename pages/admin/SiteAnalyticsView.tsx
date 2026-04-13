import React, { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  Filter,
  Globe2,
  Eye,
  LineChart,
  Monitor,
  Search,
  Smartphone,
  MapPinned,
  RefreshCw,
  Store,
  Users,
} from 'lucide-react';
import { useAdminSiteAnalytics, type AnalyticsPeriod } from '../../src/hooks/useAdminSiteAnalytics';

const periodOptions: { value: AnalyticsPeriod; label: string }[] = [
  { value: 7, label: 'Semana' },
  { value: 15, label: 'Quinzenal' },
  { value: 30, label: 'Mensal' },
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  }).format(new Date(value));

const formatDateTime = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));

const SummaryCard: React.FC<{
  title: string;
  value: number;
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

const TableCard: React.FC<{
  title: string;
  helper: string;
  children: React.ReactNode;
}> = ({ title, helper, children }) => (
  <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
    <div className="border-b border-slate-100 pb-5">
      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">{helper}</p>
      <h3 className="mt-2 text-lg font-black text-slate-950">{title}</h3>
    </div>
    <div className="mt-5">{children}</div>
  </div>
);

const SiteAnalyticsView: React.FC = () => {
  const [period, setPeriod] = useState<AnalyticsPeriod>(7);
  const [filterType, setFilterType] = useState<'all' | 'pages' | 'announcements' | 'stores'>('all');
  const [filterTerm, setFilterTerm] = useState('');
  const {
    summary,
    series,
    topPages,
    topAnnouncements,
    topStores,
    livePresence,
    deviceBreakdown,
    sourceBreakdown,
    topSearches,
    geoBreakdown,
    isLoading,
    error,
    refresh,
  } = useAdminSiteAnalytics(period);

  const maxSeriesViews = useMemo(
    () => Math.max(1, ...series.map((point) => point.pageViews || 0)),
    [series]
  );
  const maxSeriesUniqueVisitors = useMemo(
    () => Math.max(1, ...series.map((point) => point.uniqueVisitors || 0)),
    [series]
  );
  const normalizedFilterTerm = filterTerm.trim().toLowerCase();

  const filteredTopPages = useMemo(() => {
    if (!normalizedFilterTerm || (filterType !== 'all' && filterType !== 'pages')) return topPages;
    return topPages.filter((page) =>
      `${page.pageLabel || ''} ${page.pagePath} ${page.pageType}`.toLowerCase().includes(normalizedFilterTerm)
    );
  }, [filterType, normalizedFilterTerm, topPages]);

  const filteredTopAnnouncements = useMemo(() => {
    if (!normalizedFilterTerm || (filterType !== 'all' && filterType !== 'announcements')) return topAnnouncements;
    return topAnnouncements.filter((announcement) =>
      `${announcement.announcementTitle || ''} ${announcement.announcementId}`.toLowerCase().includes(normalizedFilterTerm)
    );
  }, [filterType, normalizedFilterTerm, topAnnouncements]);

  const filteredTopStores = useMemo(() => {
    if (!normalizedFilterTerm || (filterType !== 'all' && filterType !== 'stores')) return topStores;
    return topStores.filter((store) =>
      `${store.storeName || ''} ${store.storeSlug}`.toLowerCase().includes(normalizedFilterTerm)
    );
  }, [filterType, normalizedFilterTerm, topStores]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-[30px] border border-slate-200 bg-white px-6 py-6 shadow-[0_24px_80px_-48px_rgba(15,23,42,0.3)] lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-emerald-700">
            <BarChart3 className="h-3.5 w-3.5" />
            Estatísticas do portal
          </div>
          <h2 className="mt-4 text-2xl font-black text-slate-950">Analytics estilo WP Statistics</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Veja acessos por período, usuários online, páginas mais visitadas e os anúncios e lojas que mais atraem tráfego.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
            {periodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setPeriod(option.value)}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  period === option.value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[24px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-medium text-rose-700">
          Não foi possível carregar as estatísticas: {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard title="Online agora" value={summary.onlineUsers} helper="Sessões ativas nos últimos 2 minutos" icon={<Activity className="h-5 w-5 text-emerald-700" />} accent="bg-emerald-50" />
        <SummaryCard title="Usuários logados online" value={summary.onlineLoggedUsers} helper="Pessoas autenticadas navegando agora" icon={<Users className="h-5 w-5 text-sky-700" />} accent="bg-sky-50" />
        <SummaryCard title="Page views" value={summary.totalPageViews} helper={`Visualizações nos últimos ${period} dias`} icon={<Eye className="h-5 w-5 text-violet-700" />} accent="bg-violet-50" />
        <SummaryCard title="Visitantes únicos" value={summary.uniqueVisitors} helper="Sessões distintas no período" icon={<LineChart className="h-5 w-5 text-amber-700" />} accent="bg-amber-50" />
        <SummaryCard title="Visitantes logados" value={summary.loggedInVisitors} helper="Usuários identificados no período" icon={<Monitor className="h-5 w-5 text-slate-700" />} accent="bg-slate-100" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <TableCard title="Acessos por dia" helper={`Série dos últimos ${period} dias`}>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="h-10 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : series.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda não há acessos registrados nesse período.</p>
          ) : (
            <div className="space-y-3">
              {series.map((point) => (
                <div key={point.bucketDate} className="grid grid-cols-[72px_1fr_1fr_78px_84px] items-center gap-3">
                  <span className="text-xs font-bold text-slate-500">{formatDate(point.bucketDate)}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#16a34a_0%,#0f172a_100%)]"
                      style={{ width: `${Math.max(6, (point.pageViews / maxSeriesViews) * 100)}%` }}
                    />
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8_0%,#1d4ed8_100%)]"
                      style={{ width: `${Math.max(6, (point.uniqueVisitors / maxSeriesUniqueVisitors) * 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">{point.pageViews} views</span>
                  <span className="text-xs text-slate-500">{point.uniqueVisitors} únicos</span>
                </div>
              ))}
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  Visualizações
                </div>
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-600" />
                  Visitantes únicos
                </div>
              </div>
            </div>
          )}
        </TableCard>

        <TableCard title="Visitantes online" helper="Tempo real">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : livePresence.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma sessão ativa no momento.</p>
          ) : (
            <div className="space-y-3">
              {livePresence.map((item) => (
                <div key={item.sessionId} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{item.userName || 'Visitante anônimo'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.pageLabel || item.currentPath} • {item.deviceType || 'dispositivo'}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">{formatDateTime(item.lastSeenAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>
      </div>

      <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_22px_60px_-42px_rgba(15,23,42,0.26)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-400">Busca contextual</p>
            <h3 className="mt-2 text-lg font-black text-slate-950">Filtrar páginas, anúncios e lojas</h3>
            <p className="mt-1 text-sm text-slate-500">Encontre rapidamente um conteúdo específico sem sair do módulo.</p>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filterTerm}
                onChange={(event) => setFilterTerm(event.target.value)}
                placeholder="Buscar página, anúncio ou loja"
                className="h-11 w-full min-w-[280px] rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/20"
              />
            </div>
            <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
              {[
                { value: 'all', label: 'Tudo' },
                { value: 'pages', label: 'Páginas' },
                { value: 'announcements', label: 'Anúncios' },
                { value: 'stores', label: 'Lojas' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilterType(option.value as typeof filterType)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    filterType === option.value ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {(filterTerm || filterType !== 'all') && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            <Filter className="h-3.5 w-3.5" />
            {filteredTopPages.length + filteredTopAnnouncements.length + filteredTopStores.length} resultado(s) visíveis
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <TableCard title="Páginas mais acessadas" helper="Top páginas">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTopPages.map((page) => (
                <div key={page.pagePath} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{page.pageLabel || page.pagePath}</p>
                      <p className="mt-1 text-xs text-slate-500">{page.pagePath}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{page.views}</p>
                      <p className="text-xs text-slate-500">{page.uniqueVisitors} únicos</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>

        <TableCard title="Anúncios mais vistos" helper="Top anúncios">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTopAnnouncements.map((announcement) => (
                <div key={announcement.announcementId} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{announcement.announcementTitle || 'Anúncio sem título'}</p>
                      <p className="mt-1 text-xs text-slate-500">{announcement.announcementId.slice(0, 8)}...</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{announcement.views}</p>
                      <p className="text-xs text-slate-500">{announcement.uniqueVisitors} únicos</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>

        <TableCard title="Lojas mais acessadas" helper="Top lojas">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTopStores.map((store) => (
                <div key={store.storeSlug} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <Store className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{store.storeName || store.storeSlug}</p>
                        <p className="mt-1 text-xs text-slate-500">/loja/{store.storeSlug}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{store.views}</p>
                      <p className="text-xs text-slate-500">{store.uniqueVisitors} únicos</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TableCard title="Origem do tráfego" helper="Direto, busca, social e referências">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : sourceBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda não há origem de tráfego registrada nesse período.</p>
          ) : (
            <div className="space-y-3">
              {sourceBreakdown.map((source) => (
                <div key={source.sourceLabel} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
                        <Globe2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{source.sourceLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">Canais de entrada no portal</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{source.views}</p>
                      <p className="text-xs text-slate-500">{source.uniqueVisitors} únicos</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>

        <TableCard title="Dispositivos" helper="Distribuição de acessos">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : deviceBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda não há dispositivos registrados nesse período.</p>
          ) : (
            <div className="space-y-3">
              {deviceBreakdown.map((device) => (
                <div key={device.deviceType} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                        <Smartphone className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold capitalize text-slate-900">{device.deviceType}</p>
                        <p className="mt-1 text-xs text-slate-500">Leitura por tipo de dispositivo</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{device.views}</p>
                      <p className="text-xs text-slate-500">{device.uniqueVisitors} únicos</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TableCard title="Principais buscas" helper="Termos mais pesquisados">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : topSearches.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda não há buscas registradas nesse período.</p>
          ) : (
            <div className="space-y-3">
              {topSearches.map((searchItem) => (
                <div key={searchItem.term} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <Search className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{searchItem.term}</p>
                        <p className="mt-1 text-xs text-slate-500">Termo pesquisado no portal</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{searchItem.searchCount}</p>
                      <p className="text-xs text-slate-500">buscas</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>

        <TableCard title="Acessos por localização" helper="Estados e cidades com mais tráfego">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : geoBreakdown.length === 0 ? (
            <p className="text-sm text-slate-500">Ainda não há localização suficiente registrada nesse período.</p>
          ) : (
            <div className="space-y-3">
              {geoBreakdown.map((geoItem) => (
                <div key={`${geoItem.state}-${geoItem.city}`} className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <MapPinned className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">{geoItem.city}</p>
                        <p className="mt-1 text-xs text-slate-500">{geoItem.state}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-950">{geoItem.views}</p>
                      <p className="text-xs text-slate-500">{geoItem.uniqueVisitors} únicos</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TableCard>
      </div>
    </div>
  );
};

export default SiteAnalyticsView;
