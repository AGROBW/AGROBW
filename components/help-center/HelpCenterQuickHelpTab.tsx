import React, { useMemo, useState } from 'react';
import { ArrowRight, BookOpen, ChevronDown, CreditCard, LifeBuoy, MessageSquare, Search, Sparkles, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

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
    description: 'Saiba como funciona a aba Vencidos, congelamento e o novo credito para republicar.',
    details: [
      'Quando o anuncio expira, ele vai para a aba Vencidos e sai das vitrines.',
      'Conversas, leads e favoritos ficam congelados para novas interacoes.',
      'Para republicar, e necessario consumir um novo credito do ciclo atual.',
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
  const [search, setSearch] = useState('');
  const [openTitle, setOpenTitle] = useState<string | null>(helpItems[0]?.title ?? null);

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
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Ajuda rapida</h2>
            <p className="text-sm text-slate-500 mt-2">
              Pesquise um tema, abra o passo a passo e siga direto para a area certa da AGRO BW.
            </p>
          </div>

          <div className="w-full max-w-xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Como podemos te ajudar?"
                className="w-full h-12 rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-green-600/20"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
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
              <section key={section.group} className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">
                    {section.group}
                  </h3>
                  <span className="text-xs text-slate-400">{section.items.length} tema(s)</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                  {section.items.map((item) => {
                    const isOpen = openTitle === item.title;

                    return (
                      <article
                        key={item.title}
                        className={`group self-start overflow-hidden rounded-[30px] border p-6 transition-all duration-300 ${
                          item.highlight
                            ? 'border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#f7fef9_100%)] shadow-[0_20px_50px_-40px_rgba(22,163,74,0.35)] hover:-translate-y-1 hover:shadow-[0_26px_62px_-40px_rgba(22,163,74,0.42)]'
                            : 'border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] shadow-[0_18px_45px_-42px_rgba(15,23,42,0.32)] hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_24px_60px_-40px_rgba(15,23,42,0.4)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenTitle(isOpen ? null : item.title)}
                          className="w-full text-left"
                        >
                          <div className="relative">
                            <ChevronDown
                              className={`absolute right-0 top-0 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-300 ${isOpen ? 'rotate-180 text-emerald-700' : 'group-hover:text-slate-500'}`}
                            />

                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-emerald-100 bg-[radial-gradient(circle_at_top,#ffffff_0%,#f4fdf7_55%,#ecfdf3_100%)] text-emerald-700 shadow-[0_18px_36px_-26px_rgba(22,163,74,0.38)]">
                              <item.icon className="h-7 w-7" strokeWidth={1.6} />
                            </div>

                            <div className="mt-5 text-center">
                              <h4 className="mx-auto max-w-[220px] text-[19px] font-black leading-[1.25] text-slate-900">
                                {item.title}
                              </h4>
                              <p className="mx-auto mt-3 max-w-[250px] text-sm leading-6 text-slate-500">
                                {item.description}
                              </p>
                            </div>

                            <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-slate-400">
                              <span>{item.details.length} passo(s)</span>
                              {item.highlight ? (
                                <>
                                  <span className="h-1 w-1 rounded-full bg-slate-300" />
                                  <span className="text-emerald-700">Em destaque</span>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </button>

                        {isOpen && (
                          <div className="mt-6 space-y-4 border-t border-slate-100/90 pt-5">
                            <ul className="space-y-2.5">
                              {item.details.map((detail) => (
                                <li key={detail} className="flex gap-2.5 text-sm leading-6 text-slate-600">
                                  <span className="mt-[9px] h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                  <span>{detail}</span>
                                </li>
                              ))}
                            </ul>

                            {item.action.to ? (
                              <Link
                                to={item.action.to}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
                              >
                                {item.action.label}
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            ) : (
                              <button
                                type="button"
                                onClick={item.action.onClick}
                                className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
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

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Atalhos</p>
            <div className="mt-4 space-y-3">
              <button
                type="button"
                onClick={onOpenMyTickets}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Ver meus tickets
              </button>
              <button
                type="button"
                onClick={onOpenNewTicket}
                className="w-full rounded-xl bg-green-700 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-green-800"
              >
                Abrir novo ticket
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-green-200 bg-green-50/70 p-5">
            <p className="text-sm font-bold text-slate-900">Ainda precisa de ajuda?</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Se nao encontrou a resposta na ajuda rapida, abra um ticket com o maximo de contexto possivel.
            </p>
            <button
              type="button"
              onClick={onOpenNewTicket}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
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
