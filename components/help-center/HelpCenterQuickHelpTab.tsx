import React, { useMemo } from 'react';
import { ArrowRight, BookOpen, ChevronDown, CreditCard, LifeBuoy, MessageSquare, Search, Sparkles, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePersistentState } from '../../src/hooks/usePersistentState';
import { useSupportSettings } from '../../src/hooks/useSupportSettings';

type HelpAction = {
  label: string;
  to?: string;
  onClick?: () => void;
};

type HelpItem = {
  title: string;
  description: string;
  details: string[];
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  group: 'Comecando agora' | 'Anuncios e visibilidade' | 'Atendimento e financeiro';
  action: HelpAction;
  highlight?: boolean;
};

type HelpCenterQuickHelpTabProps = {
  onOpenNewTicket: () => void;
  onOpenMyTickets: () => void;
};

const helpItems: HelpItem[] = [
  {
    title: 'Como publicar um anuncio',
    description: 'Entenda cada etapa da publicacao, das fotos ate a revisao final.',
    details: [
      'Escolha a categoria correta para o produto ou servico.',
      'Preencha titulo, descricao, preco e dados tecnicos com informacoes objetivas.',
      'Envie fotos nítidas e revise tudo antes de publicar.',
    ],
    icon: BookOpen,
    group: 'Comecando agora',
    action: {
      label: 'Publicar anuncio',
      to: '/anunciar',
    },
  },
  {
    title: 'Destaques e visibilidade',
    description: 'Veja quando usar destaque na categoria ou na home para acelerar resultados.',
    details: [
      'Destaque na categoria melhora a presenca do anuncio em paginas especificas.',
      'Destaque na home entrega mais exposicao e costuma ser melhor para campanhas fortes.',
      'Use destaque quando o anuncio estiver bem completo, com fotos e preco atrativo.',
    ],
    icon: Sparkles,
    group: 'Anuncios e visibilidade',
    action: {
      label: 'Ir para Meus Anuncios',
      to: '/minha-conta/anuncios',
    },
  },
  {
    title: 'Anuncio vencido e republicacao',
    description: 'Saiba como funciona a aba Vencidos, o congelamento e a reativacao conforme o limite atual do plano.',
    details: [
      'Quando o anuncio expira, ele vai para a aba Vencidos e sai das vitrines.',
      'Conversas, leads e favoritos ficam congelados para novas interacoes.',
      'Para reativar, e necessario ter vaga disponivel no limite atual de anuncios ativos do plano.',
    ],
    icon: Ticket,
    group: 'Anuncios e visibilidade',
    action: {
      label: 'Ver anuncios vencidos',
      to: '/minha-conta/anuncios',
    },
    highlight: true,
  },
  {
    title: 'Mensagens e contatos',
    description: 'Entenda como leads, conversas e bloqueios por expiracao funcionam.',
    details: [
      'As conversas ficam disponiveis enquanto o anuncio estiver ativo.',
      'Se o anuncio expirar, o historico permanece, mas novas mensagens sao bloqueadas.',
      'Leads e contatos seguem a regra do plano e da situacao do anuncio.',
    ],
    icon: MessageSquare,
    group: 'Atendimento e financeiro',
    action: {
      label: 'Abrir mensagens',
      to: '/minha-conta/mensagens',
    },
  },
  {
    title: 'Pagamentos e notas fiscais',
    description: 'Acompanhe cobrancas, comprovantes e documentos fiscais do seu plano.',
    details: [
      'A area Financeiro mostra pagamentos aprovados, comprovantes e notas fiscais.',
      'Quando a nota fiscal estiver pronta, ela fica disponivel para download.',
      'Use essa area para conferir status de cobranca e historico financeiro.',
    ],
    icon: CreditCard,
    group: 'Atendimento e financeiro',
    action: {
      label: 'Abrir financeiro',
      to: '/minha-conta/financeiro',
    },
    highlight: true,
  },
  {
    title: 'Falar com o suporte',
    description: 'Se nao encontrou a resposta, abra um ticket e acompanhe o atendimento por aqui.',
    details: [
      'Abra um novo ticket com assunto claro e o maximo de contexto possivel.',
      'Quando o suporte responder, voce recebe aviso pelo site e por e-mail.',
      'Tickets resolvidos ficam encerrados para novas mensagens, mas continuam no historico.',
    ],
    icon: LifeBuoy,
    group: 'Atendimento e financeiro',
    action: {
      label: 'Abrir novo ticket',
      onClick: undefined,
    },
    highlight: true,
  },
];

const groupOrder: Array<HelpItem['group']> = [
  'Comecando agora',
  'Anuncios e visibilidade',
  'Atendimento e financeiro',
];

const HelpCenterQuickHelpTab: React.FC<HelpCenterQuickHelpTabProps> = ({
  onOpenNewTicket,
  onOpenMyTickets,
}) => {
  const { settings: supportSettings } = useSupportSettings();
  const [search, setSearch] = usePersistentState('help-center:quick-search', '');
  const [openTitle, setOpenTitle] = usePersistentState<string | null>('help-center:quick-open-title', helpItems[0]?.title ?? null);

  const itemsWithActions = useMemo(
    () =>
      helpItems.map((item) =>
        item.title === 'Falar com o suporte'
          ? {
              ...item,
              action: {
                ...item.action,
                onClick: onOpenNewTicket,
              },
            }
          : item
      ),
    [onOpenNewTicket]
  );

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) return itemsWithActions;

    return itemsWithActions.filter((item) => {
      const haystack = [item.title, item.description, ...item.details, item.group]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [itemsWithActions, search]);

  const groupedItems = useMemo(
    () =>
      groupOrder
        .map((group) => ({
          group,
          items: filteredItems.filter((item) => item.group === group),
        }))
        .filter((entry) => entry.items.length > 0),
    [filteredItems]
  );

  return (
    <div className="space-y-6">
      {/* Barra de busca */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Pesquise um tema ou dúvida..."
          className="w-full h-12 rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-700 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-green-600/20"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_288px] gap-6">
        {/* Lista de temas */}
        <div className="space-y-6">
          {groupedItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <p className="text-sm font-semibold text-slate-800">Nenhum tema encontrado</p>
              <p className="text-sm text-slate-500 mt-2">
                Tente buscar com outras palavras ou abra um ticket para falar com o suporte.
              </p>
              <button
                onClick={onOpenNewTicket}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
              >
                Abrir novo ticket
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            groupedItems.map((section) => (
              <section key={section.group} className="space-y-2">
                <div className="flex items-center gap-3 pb-1">
                  <h3 className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                    {section.group}
                  </h3>
                  <div className="flex-1 h-px bg-slate-100" />
                  <span className="text-xs text-slate-400">{section.items.length} tema(s)</span>
                </div>

                <div className="space-y-2">
                  {section.items.map((item) => {
                    const isOpen = openTitle === item.title;

                    return (
                      <article
                        key={item.title}
                        className={`overflow-hidden rounded-2xl border transition-all duration-300 ${
                          item.highlight
                            ? 'border-emerald-200 bg-white shadow-[0_4px_20px_-8px_rgba(22,163,74,0.2)]'
                            : 'border-slate-200 bg-white'
                        } ${
                          isOpen ? 'shadow-md' : 'hover:border-slate-300 hover:shadow-sm'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenTitle(isOpen ? null : item.title)}
                          className="w-full text-left px-5 py-4"
                        >
                          <div className="flex items-center gap-4">
                            {/* Ícone */}
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                              item.highlight
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                : 'bg-slate-50 text-slate-600 border border-slate-200'
                            }`}>
                              <item.icon className="h-5 w-5" strokeWidth={1.7} />
                            </div>

                            {/* Texto */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-bold text-slate-900">{item.title}</h4>
                                {item.highlight && (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                                    Destaque
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-sm text-slate-500 line-clamp-1">{item.description}</p>
                            </div>

                            {/* Chevron + count */}
                            <div className="flex shrink-0 items-center gap-3">
                              <span className="hidden sm:inline text-xs text-slate-400">{item.details.length} passo(s)</span>
                              <ChevronDown
                                className={`h-4 w-4 text-slate-400 transition-transform duration-300 ${
                                  isOpen ? 'rotate-180 text-emerald-600' : ''
                                }`}
                              />
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="px-5 pb-5 space-y-4 border-t border-slate-100">
                            <ul className="mt-4 space-y-2.5">
                              {item.details.map((detail) => (
                                <li key={detail} className="flex gap-3 text-sm leading-6 text-slate-600">
                                  <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                  <span>{detail}</span>
                                </li>
                              ))}
                            </ul>

                            {item.action.to ? (
                              <Link
                                to={item.action.to}
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                              >
                                {item.action.label}
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={item.action.onClick}
                                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                              >
                                {item.action.label}
                                <ArrowRight className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        {/* Aside */}
        <aside className="space-y-4">
          {/* Atalhos */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Atalhos</p>
            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={onOpenMyTickets}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Ver meus tickets
              </button>
              <button
                type="button"
                onClick={onOpenNewTicket}
                className="w-full rounded-xl bg-slate-900 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Abrir novo ticket
              </button>
            </div>
          </div>

          {/* Tempo de resposta */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{supportSettings.cardTitle}</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{supportSettings.averageResponseLabel}</span>
                <span className="text-sm font-bold text-slate-900">{supportSettings.averageResponseValue}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{supportSettings.scheduleLabel}</span>
                <span className="text-sm font-bold text-slate-900">{supportSettings.scheduleDays}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">{supportSettings.scheduleTimeLabel}</span>
                <span className="text-sm font-bold text-slate-900">{supportSettings.scheduleTime}</span>
              </div>
            </div>
            <div
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                supportSettings.isOnline
                  ? 'border-emerald-100 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  supportSettings.isOnline ? 'animate-pulse bg-emerald-500' : 'bg-slate-400'
                }`}
              />
              <span className={`text-xs font-semibold ${supportSettings.isOnline ? 'text-emerald-700' : 'text-slate-600'}`}>
                {supportSettings.isOnline ? supportSettings.onlineStatusText : supportSettings.offlineStatusText}
              </span>
            </div>
          </div>

          {/* CTA */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
            <p className="text-sm font-bold text-slate-900">Ainda precisa de ajuda?</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se nao encontrou a resposta, abra um ticket com o maximo de contexto possivel.
            </p>
            <button
              type="button"
              onClick={onOpenNewTicket}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Falar com o suporte
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default HelpCenterQuickHelpTab;
