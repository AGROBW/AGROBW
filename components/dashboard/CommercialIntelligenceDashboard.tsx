import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Copy,
  HandHeart,
  MessageCircle,
  Mail,
  MapPin,
  MessageSquare,
  Send,
  Search,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useCommercialIntelligence } from '../../src/hooks/useCommercialIntelligence';
import { useAuth } from '../../src/contexts/AuthContext';

const scoreMeta = {
  high: {
    label: 'Alto interesse',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  medium: {
    label: 'Medio interesse',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  low: {
    label: 'Baixo interesse',
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
  },
} as const;

const formatCurrencyRange = (min: number | null, max: number | null) => {
  if (min === null && max === null) return 'Sem faixa observada';
  const format = (value: number) =>
    value.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });

  if (min !== null && max !== null) {
    if (min === max) return format(min);
    return `${format(min)} a ${format(max)}`;
  }

  return min !== null ? `A partir de ${format(min)}` : `Ate ${format(max as number)}`;
};

const formatDateTime = (value: string | null) => {
  if (!value) return 'Sem atividade recente';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
};

const CommercialIntelligenceDashboard: React.FC = () => {
  const { user } = useAuth();
  const {
    categories,
    subcategoriesByCategory,
    preference,
    report,
    outreachCampaigns,
    receivedOpportunities,
    interestResponses,
    conversations,
    conversationMessages,
    contactShares,
    hasCommercialIntelligence,
    requestLimit,
    requestCountThisMonth,
    remainingRequests,
    outreachCountThisMonth,
    isLoading,
    isSavingPreference,
    isGeneratingReport,
    isSendingOutreach,
    isRespondingToOpportunity,
    isStartingConversation,
    isSendingConversationMessage,
    isGrantingContactShare,
    loadingConversationId,
    savePreference,
    generateReport,
    sendOutreach,
    respondToOpportunity,
    loadConversationMessages,
    startConversation,
    sendConversationMessage,
    grantContactShare,
  } = useCommercialIntelligence();

  const [allowCommercialContact, setAllowCommercialContact] = useState(false);
  const [allowedCategorySlugs, setAllowedCategorySlugs] = useState<string[]>([]);
  const [preferredChannels, setPreferredChannels] = useState<string[]>(['platform']);
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('');
  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState('');
  const [hasGeneratedAtLeastOnce, setHasGeneratedAtLeastOnce] = useState(false);
  const [outreachMessage, setOutreachMessage] = useState('');
  const [interestNotes, setInterestNotes] = useState<Record<string, string>>({});
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [conversationStarters, setConversationStarters] = useState<Record<string, string>>({});
  const [conversationDrafts, setConversationDrafts] = useState<Record<string, string>>({});
  const [shareEmailByConversation, setShareEmailByConversation] = useState<Record<string, boolean>>({});
  const [shareWhatsappByConversation, setShareWhatsappByConversation] = useState<Record<string, boolean>>({});
  const [shareNotesByConversation, setShareNotesByConversation] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!preference) return;
    setAllowCommercialContact(preference.allowCommercialContact);
    setAllowedCategorySlugs(preference.allowedCategorySlugs);
    setPreferredChannels(preference.preferredChannels.length > 0 ? preference.preferredChannels : ['platform']);
  }, [preference]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.slug === selectedCategorySlug) || null,
    [categories, selectedCategorySlug]
  );

  const availableSubcategories = useMemo(() => {
    if (!selectedCategory) return [];
    return subcategoriesByCategory[selectedCategory.id] || [];
  }, [selectedCategory, subcategoriesByCategory]);

  const selectedSubcategory = useMemo(
    () => availableSubcategories.find((subcategory) => subcategory.slug === selectedSubcategorySlug) || null,
    [availableSubcategories, selectedSubcategorySlug]
  );

  const reportSummary = useMemo(() => {
    return report.reduce(
      (acc, row) => {
        acc.interestedBuyers += row.interestedBuyers;
        acc.consentingBuyers += row.consentingBuyers;
        acc.announcementViews += row.announcementViews;
        acc.favoritesCount += row.favoritesCount;
        acc.leadActions += row.leadActions;
        return acc;
      },
      {
        interestedBuyers: 0,
        consentingBuyers: 0,
        announcementViews: 0,
        favoritesCount: 0,
        leadActions: 0,
      }
    );
  }, [report]);

  const conversationsByResponseId = useMemo(
    () =>
      conversations.reduce<Record<string, string>>((acc, conversation) => {
        acc[conversation.responseId] = conversation.conversationId;
        return acc;
      }, {}),
    [conversations]
  );

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.conversationId === selectedConversationId) || null,
    [conversations, selectedConversationId]
  );

  const contactShareByConversationId = useMemo(
    () =>
      contactShares.reduce<Record<string, (typeof contactShares)[number]>>((acc, share) => {
        acc[share.conversationId] = share;
        return acc;
      }, {}),
    [contactShares]
  );

  useEffect(() => {
    if (!selectedConversationId && conversations.length > 0) {
      setSelectedConversationId(conversations[0].conversationId);
    }
  }, [conversations, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return;
    if (conversationMessages[selectedConversationId]) return;
    void loadConversationMessages(selectedConversationId);
  }, [conversationMessages, loadConversationMessages, selectedConversationId]);

  const outreachMessageSuggestion = useMemo(() => {
    const categoryLabel = selectedCategory?.name || 'esta categoria';
    const subcategoryLabel = selectedSubcategory?.name
      ? `, com foco em ${selectedSubcategory.name}`
      : '';

    return [
      `Ola!`,
      '',
      `identificamos que voce demonstrou interesse recente em ${categoryLabel}${subcategoryLabel} dentro da AGRO BW.`,
      `Uma loja parceira deseja apresentar uma oferta alinhada a esse interesse, sem compromisso e com contato mediado pela plataforma.`,
      '',
      `Se fizer sentido para voce, acesse a central da AGRO BW e avalie essa oportunidade.`,
    ].join('\n');
  }, [selectedCategory?.name, selectedSubcategory?.name]);

  useEffect(() => {
    if (!selectedCategorySlug) return;
    setOutreachMessage((current) => (current.trim() ? current : outreachMessageSuggestion));
  }, [outreachMessageSuggestion, selectedCategorySlug]);

  const toggleCategory = (slug: string) => {
    setAllowedCategorySlugs((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug]
    );
  };

  const toggleChannel = (channel: string) => {
    setPreferredChannels((current) => {
      if (current.includes(channel)) {
        const next = current.filter((item) => item !== channel);
        return next.length > 0 ? next : ['platform'];
      }
      return [...current, channel];
    });
  };

  const handleSavePreference = async () => {
    try {
      await savePreference({
        allowCommercialContact,
        allowedCategorySlugs,
        preferredChannels,
      });

      toast.success('Preferencias comerciais salvas com sucesso.');
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao salvar preferencias:', error);
      toast.error(error?.message || 'Nao foi possivel salvar as preferencias comerciais.');
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedCategorySlug) {
      toast.error('Selecione uma categoria para gerar a inteligencia.');
      return;
    }

    try {
      await generateReport(selectedCategorySlug, selectedSubcategorySlug || undefined);
      setHasGeneratedAtLeastOnce(true);
      toast.success('Inteligencia comercial gerada com sucesso.');
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao gerar relatorio:', error);
      toast.error(error?.message || 'Nao foi possivel gerar a inteligencia comercial.');
    }
  };

  const handleSendOutreach = async () => {
    if (!selectedCategorySlug) {
      toast.error('Selecione uma categoria antes de enviar a abordagem mediada.');
      return;
    }

    if (!outreachMessage.trim()) {
      toast.error('Escreva a mensagem que sera entregue aos opt-ins.');
      return;
    }

    try {
      const result = await sendOutreach(selectedCategorySlug, selectedSubcategorySlug || undefined, outreachMessage.trim());
      toast.success(
        result.deliveredCount > 0
          ? `Campanha mediada enviada para ${result.deliveredCount} opt-in(s).`
          : 'Nenhum opt-in compativel foi encontrado para esse filtro.'
      );
      if (result.deliveredCount > 0) {
        setOutreachMessage(outreachMessageSuggestion);
      }
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao enviar campanha mediada:', error);
      toast.error(error?.message || 'Nao foi possivel enviar a campanha mediada.');
    }
  };

  const handleConfirmInterest = async (deliveryId: string) => {
    try {
      await respondToOpportunity(deliveryId, interestNotes[deliveryId] || '');
      toast.success('Interesse confirmado com sucesso. A loja foi avisada pela plataforma.');
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao confirmar interesse:', error);
      toast.error(error?.message || 'Nao foi possivel confirmar seu interesse agora.');
    }
  };

  const handleStartConversation = async (responseId: string) => {
    const starterMessage = (conversationStarters[responseId] || '').trim();
    if (!starterMessage) {
      toast.error('Escreva a mensagem inicial da conversa mediada.');
      return;
    }

    try {
      const result = await startConversation(responseId, starterMessage);
      if (result.conversationId) {
        setSelectedConversationId(result.conversationId);
        setConversationStarters((current) => ({
          ...current,
          [responseId]: '',
        }));
      }
      toast.success('Conversa mediada iniciada com sucesso.');
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao iniciar conversa mediada:', error);
      toast.error(error?.message || 'Nao foi possivel iniciar a conversa mediada.');
    }
  };

  const handleOpenConversation = async (conversationId: string) => {
    setSelectedConversationId(conversationId);
    if (!conversationMessages[conversationId]) {
      try {
        await loadConversationMessages(conversationId);
      } catch (error: any) {
        console.error('[CommercialIntelligence] Erro ao carregar conversa:', error);
        toast.error(error?.message || 'Nao foi possivel carregar a conversa mediada.');
      }
    }
  };

  const handleSendConversationMessage = async (conversationId: string) => {
    const message = (conversationDrafts[conversationId] || '').trim();
    if (!message) {
      toast.error('Escreva uma mensagem para enviar.');
      return;
    }

    try {
      await sendConversationMessage(conversationId, message);
      setConversationDrafts((current) => ({
        ...current,
        [conversationId]: '',
      }));
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao enviar mensagem mediada:', error);
      toast.error(error?.message || 'Nao foi possivel enviar a mensagem agora.');
    }
  };

  const handleGrantContactShare = async (conversationId: string) => {
    const shareEmail = Boolean(shareEmailByConversation[conversationId]);
    const shareWhatsapp = Boolean(shareWhatsappByConversation[conversationId]);

    if (!shareEmail && !shareWhatsapp) {
      toast.error('Selecione pelo menos um canal para compartilhar com a loja.');
      return;
    }

    try {
      await grantContactShare(
        conversationId,
        shareEmail,
        shareWhatsapp,
        shareNotesByConversation[conversationId] || ''
      );
      toast.success('Contato compartilhado com sucesso para esta loja.');
    } catch (error: any) {
      console.error('[CommercialIntelligence] Erro ao compartilhar contato:', error);
      toast.error(error?.message || 'Nao foi possivel compartilhar seus contatos agora.');
    }
  };

  const copySuggestedMessage = async (regionLabel: string, scoreBand: 'high' | 'medium' | 'low') => {
    const scoreLabel = scoreMeta[scoreBand].label;
    const message = [
      `Equipe AGRO BW,`,
      '',
      `quero montar uma abordagem comercial para compradores com ${scoreLabel.toLowerCase()} em ${regionLabel}.`,
      `Categoria: ${selectedCategory?.name || 'Nao informada'}.`,
      selectedSubcategorySlug
        ? `Subcategoria: ${availableSubcategories.find((item) => item.slug === selectedSubcategorySlug)?.name || selectedSubcategorySlug}.`
        : 'Subcategoria: todas as opcoes da categoria.',
      '',
      'Sugestao de acao:',
      '- reforcar anuncios com maior aderencia de preco',
      '- ajustar criativos e argumentos comerciais para essa regiao',
      '- ativar campanha interna ou contato mediado pela plataforma para opt-ins disponiveis',
    ].join('\n');

    try {
      await navigator.clipboard.writeText(message);
      toast.success('Abordagem sugerida copiada.');
    } catch {
      toast.error('Nao foi possivel copiar a abordagem sugerida.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-[24px] border border-slate-200 bg-slate-100" />
        <div className="h-64 animate-pulse rounded-[24px] border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {receivedOpportunities.length > 0 && (
        <section className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <HandHeart className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Oportunidades mediadas recebidas</h3>
              <p className="text-sm text-slate-500">Voce decide se quer sinalizar interesse para a loja, sem liberar seus dados de contato nesta etapa.</p>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {receivedOpportunities.map((opportunity) => (
              <div key={opportunity.deliveryId} className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {opportunity.sellerLabel}
                      </span>
                      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                        {opportunity.categorySlug}
                        {opportunity.subcategorySlug ? ` / ${opportunity.subcategorySlug}` : ''}
                      </span>
                    </div>
                    <p className="text-sm leading-7 text-slate-700">{opportunity.messageTemplate}</p>
                    <p className="text-xs text-slate-500">
                      Recebida em{' '}
                      {new Date(opportunity.receivedAt).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 lg:max-w-sm">
                    <p className="font-semibold text-slate-900">Seguranca desta resposta</p>
                    <p className="mt-2 leading-6">
                      Ao clicar em <strong>Tenho interesse</strong>, a AGRO BW apenas informa a loja que existe um comprador interessado.
                      Seus dados de contato nao sao compartilhados nesta fase.
                    </p>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <label className="text-sm font-semibold text-slate-900">Observacao opcional</label>
                  <textarea
                    value={interestNotes[opportunity.deliveryId] || ''}
                    onChange={(event) =>
                      setInterestNotes((current) => ({
                        ...current,
                        [opportunity.deliveryId]: event.target.value,
                      }))
                    }
                    rows={3}
                    disabled={opportunity.hasResponse}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 disabled:bg-slate-50"
                    placeholder="Ex.: Tenho interesse, mas procuro algo na faixa de preco ate X."
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleConfirmInterest(opportunity.deliveryId)}
                    disabled={opportunity.hasResponse || isRespondingToOpportunity}
                    className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {opportunity.hasResponse
                      ? 'Interesse ja confirmado'
                      : isRespondingToOpportunity
                        ? 'Confirmando interesse...'
                        : 'Tenho interesse'}
                  </button>
                  {opportunity.hasResponse && (
                    <span className="text-xs font-semibold text-emerald-700">
                      Respondido em{' '}
                      {opportunity.respondedAt
                        ? new Date(opportunity.respondedAt).toLocaleString('pt-BR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : 'instantes atras'}
                    </span>
                  )}
                  {opportunity.hasResponse && conversations.some((conversation) => conversation.campaignId === opportunity.campaignId && conversation.role === 'buyer') ? (
                    <button
                      type="button"
                      onClick={() => {
                        const matchingConversation = conversations.find(
                          (conversation) => conversation.campaignId === opportunity.campaignId && conversation.role === 'buyer'
                        );
                        if (matchingConversation) {
                          void handleOpenConversation(matchingConversation.conversationId);
                        }
                      }}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Abrir conversa mediada
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.35)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Inteligencia comercial segura
            </div>
            <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Radar de demanda com consentimento separado</h2>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              Este modulo entrega apenas sinais agregados de interesse e contagem de opt-ins por segmento.
              Nenhum contato pessoal bruto e compartilhado sem consentimento especifico do titular.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Janela analisada</p>
            <p className="mt-1">Ultimos 30 dias</p>
            <p className="mt-3 font-semibold text-slate-900">Sinais usados</p>
            <p className="mt-1">Visualizacoes, favoritos e leads ja iniciados na plataforma</p>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr,1.2fr]">
        <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Meu opt-in comercial</h3>
              <p className="text-sm text-slate-500">Controle separado, especifico e revogavel.</p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            Ao ativar este consentimento, voce autoriza o uso dos seus sinais de interesse em relatorios agregados da plataforma e a contagem do seu opt-in por categoria selecionada. Seus dados pessoais diretos nao sao exibidos neste MVP.
          </div>

          <div className="mt-6 space-y-5">
            <label className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
              <div className="pr-4">
                <p className="text-sm font-semibold text-slate-900">Aceito participar de oportunidades comerciais segmentadas</p>
                <p className="mt-1 text-xs text-slate-500">Voce pode revogar esse consentimento a qualquer momento.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowCommercialContact}
                onClick={() => setAllowCommercialContact((current) => !current)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${allowCommercialContact ? 'bg-green-600' : 'bg-slate-300'}`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    allowCommercialContact ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </label>

            <div>
              <p className="text-sm font-semibold text-slate-900">Categorias autorizadas</p>
              <p className="mt-1 text-xs text-slate-500">Se nada for marcado, o sistema interpreta que o consentimento vale para todas as categorias.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {categories.map((category) => {
                  const checked = allowedCategorySlugs.includes(category.slug);
                  return (
                    <label key={category.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCategory(category.slug)}
                        className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                      />
                      <span>{category.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">Canais preferidos</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {[
                  { key: 'platform', label: 'Plataforma', icon: MessageSquare },
                  { key: 'email', label: 'E-mail', icon: Mail },
                  { key: 'whatsapp', label: 'WhatsApp', icon: Users },
                ].map(({ key, label, icon: Icon }) => (
                  <label key={key} className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={preferredChannels.includes(key)}
                      onChange={() => toggleChannel(key)}
                      className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                    />
                    <Icon className="h-4 w-4 text-slate-500" />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleSavePreference}
              disabled={isSavingPreference}
              className="inline-flex items-center justify-center rounded-2xl bg-green-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-green-300"
            >
              {isSavingPreference ? 'Salvando...' : 'Salvar preferencias'}
            </button>
          </div>
        </div>

        <div className="rounded-[26px] border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.3)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-sky-700">
                <TrendingUp className="h-3.5 w-3.5" />
                Exclusivo por plano
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Painel de inteligencia comercial</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Gera uma leitura segmentada da demanda recente por categoria, subcategoria, regiao e intensidade de interesse.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Consultas do mes</p>
              <p className="mt-1">
                {requestCountThisMonth} usada(s) de {requestLimit || 0}
              </p>
              <p className="mt-1 font-semibold text-slate-900">{remainingRequests} restante(s)</p>
            </div>
          </div>

          {!hasCommercialIntelligence ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Upgrade necessario</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Seu plano atual nao inclui o modulo de inteligencia comercial. Este recurso pode ser ativado em planos como Loja Virtual, com limite mensal configurado pelo admin.
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Categoria principal</span>
                  <select
                    value={selectedCategorySlug}
                    onChange={(event) => {
                      setSelectedCategorySlug(event.target.value);
                      setSelectedSubcategorySlug('');
                    }}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                  >
                    <option value="">Selecione uma categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.slug}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-semibold text-slate-700">Subcategoria</span>
                  <select
                    value={selectedSubcategorySlug}
                    onChange={(event) => setSelectedSubcategorySlug(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700"
                    disabled={!selectedCategory}
                  >
                    <option value="">Todas as subcategorias</option>
                    {availableSubcategories.map((subcategory) => (
                      <option key={subcategory.id} value={subcategory.slug}>
                        {subcategory.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={isGeneratingReport || !selectedCategorySlug || remainingRequests <= 0}
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {isGeneratingReport ? 'Gerando inteligencia...' : 'Gerar inteligencia do mes'}
                </button>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  Cada geracao consome uma consulta do mes.
                </div>
              </div>

              {report.length > 0 && (
                <>
                  <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {[
                      { label: 'Compradores interessados', value: reportSummary.interestedBuyers, icon: Users },
                      { label: 'Opt-ins disponiveis', value: reportSummary.consentingBuyers, icon: ShieldCheck },
                      { label: 'Visualizacoes', value: reportSummary.announcementViews, icon: TrendingUp },
                      { label: 'Favoritos', value: reportSummary.favoritesCount, icon: Search },
                      { label: 'Leads ja iniciados', value: reportSummary.leadActions, icon: MessageSquare },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-slate-500">
                          <Icon className="h-4 w-4" />
                          <span className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</span>
                        </div>
                        <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 space-y-3">
                    {report.map((row, index) => {
                      const regionLabel = row.city ? `${row.city}, ${row.state}` : row.state || 'Nao informado';
                      const score = scoreMeta[row.scoreBand];
                      return (
                        <div key={`${regionLabel}-${row.scoreBand}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5">
                          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {regionLabel}
                                </span>
                                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${score.badgeClass}`}>
                                  {score.label}
                                </span>
                              </div>
                              <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                                <p><strong className="text-slate-900">{row.interestedBuyers}</strong> comprador(es) com interesse observado</p>
                                <p><strong className="text-slate-900">{row.consentingBuyers}</strong> opt-in(s) disponivel(is)</p>
                                <p><strong className="text-slate-900">{row.announcementViews}</strong> visualizacao(oes) de anuncios</p>
                                <p><strong className="text-slate-900">{row.favoritesCount}</strong> favorito(s) no nicho</p>
                                <p><strong className="text-slate-900">{row.leadActions}</strong> lead(s) ja iniciado(s)</p>
                                <p>Faixa observada: <strong className="text-slate-900">{formatCurrencyRange(row.priceMin, row.priceMax)}</strong></p>
                              </div>
                              <p className="text-xs text-slate-500">Ultima atividade observada: {formatDateTime(row.lastActivityAt)}</p>
                            </div>

                            <button
                              type="button"
                              onClick={() => copySuggestedMessage(regionLabel, row.scoreBand)}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                              <Copy className="h-4 w-4" />
                              Copiar abordagem sugerida
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-6 rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-2xl">
                        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
                          <Mail className="h-3.5 w-3.5" />
                          Contato mediado
                        </div>
                        <h4 className="mt-4 text-base font-bold text-slate-900">Acione apenas os opt-ins compativeis</h4>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          Neste MVP, a plataforma envia uma notificacao interna para compradores que deram consentimento valido para a categoria selecionada.
                          A identidade deles continua protegida, e a conta elegivel pode disparar apenas uma campanha mediada por mes.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                        <p className="font-semibold text-slate-900">Campanhas mediadas no mes</p>
                        <p className="mt-1">{outreachCountThisMonth} usada(s) de 1</p>
                        <p className="mt-1 font-semibold text-slate-900">
                          {Math.max(0, 1 - outreachCountThisMonth)} restante(s)
                        </p>
                      </div>
                    </div>

                    {reportSummary.consentingBuyers <= 0 ? (
                      <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                        Ainda nao existem opt-ins compativeis com esse recorte. Voce pode usar os dados agregados para ajustar sua estrategia e tentar outro filtro.
                      </div>
                    ) : (
                      <>
                        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">
                          {reportSummary.consentingBuyers} opt-in(s) qualificado(s) estao disponiveis para receber esta abordagem pela plataforma.
                          O sistema limita o disparo aos 50 sinais mais aderentes dos ultimos 30 dias.
                        </div>

                        <div className="mt-5 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <label className="text-sm font-semibold text-slate-900">Mensagem mediada</label>
                            <button
                              type="button"
                              onClick={() => setOutreachMessage(outreachMessageSuggestion)}
                              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Usar mensagem sugerida
                            </button>
                          </div>
                          <textarea
                            value={outreachMessage}
                            onChange={(event) => setOutreachMessage(event.target.value)}
                            rows={6}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                            placeholder="Escreva a mensagem que sera entregue aos opt-ins compativeis."
                          />
                          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                            <span>Mensagem minima de 40 caracteres e maxima de 1200.</span>
                            <span>{outreachMessage.trim().length}/1200</span>
                          </div>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={handleSendOutreach}
                            disabled={isSendingOutreach || outreachCountThisMonth >= 1 || !outreachMessage.trim()}
                            className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                          >
                            {isSendingOutreach ? 'Enviando campanha mediada...' : 'Enviar aos opt-ins pela plataforma'}
                          </button>
                          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600">
                            <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            O vendedor nao recebe nome, e-mail nem WhatsApp dos compradores.
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {outreachCampaigns.length > 0 && (
                    <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700">
                          <Mail className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-slate-900">Historico de campanhas mediadas</h4>
                          <p className="text-sm text-slate-500">Ultimos disparos enviados pela plataforma para opt-ins elegiveis.</p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        {outreachCampaigns.map((campaign) => (
                          <div key={campaign.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {campaign.categorySlug}
                                  {campaign.subcategorySlug ? ` / ${campaign.subcategorySlug}` : ''}
                                </p>
                                <p className="text-sm leading-6 text-slate-600">{campaign.messageTemplate}</p>
                              </div>
                              <div className="text-sm text-slate-600 lg:text-right">
                                <p><strong className="text-slate-900">{campaign.recipientsCount}</strong> opt-in(s) elegiveis</p>
                                <p><strong className="text-slate-900">{campaign.deliveredCount}</strong> notificacao(oes) entregue(s)</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {new Date(campaign.createdAt).toLocaleString('pt-BR', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </>
              )}

              {hasGeneratedAtLeastOnce && report.length === 0 && (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600">
                  Nenhum segmento com sinal suficiente foi encontrado para esse filtro nos ultimos 30 dias. Tente ampliar a categoria ou remover a subcategoria.
                </div>
              )}

              {interestResponses.length > 0 && (
                <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                      <HandHeart className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900">Interesses confirmados</h4>
                      <p className="text-sm text-slate-500">Respostas mediadas de compradores que aceitaram sinalizar interesse para sua loja.</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {interestResponses.map((response) => (
                      <div key={response.responseId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                {response.buyerName}
                              </span>
                              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                                {response.categorySlug}
                                {response.subcategorySlug ? ` / ${response.subcategorySlug}` : ''}
                              </span>
                            </div>
                            <p className="text-sm text-slate-600">
                              Regiao: <strong className="text-slate-900">{response.buyerCity ? `${response.buyerCity}, ${response.buyerState}` : response.buyerState || 'Nao informada'}</strong>
                            </p>
                            {response.buyerNote ? (
                              <p className="text-sm leading-6 text-slate-700">{response.buyerNote}</p>
                            ) : (
                              <p className="text-sm text-slate-500">Sem observacao adicional do comprador.</p>
                            )}

                            {conversationsByResponseId[response.responseId] ? (
                              <button
                                type="button"
                                onClick={() => void handleOpenConversation(conversationsByResponseId[response.responseId])}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                              >
                                <MessageCircle className="h-4 w-4" />
                                Abrir conversa mediada
                              </button>
                            ) : (
                              <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                                <label className="text-sm font-semibold text-slate-900">Mensagem inicial para este comprador</label>
                                <textarea
                                  value={conversationStarters[response.responseId] || ''}
                                  onChange={(event) =>
                                    setConversationStarters((current) => ({
                                      ...current,
                                      [response.responseId]: event.target.value,
                                    }))
                                  }
                                  rows={4}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                                  placeholder="Ex.: Obrigado pelo interesse. Podemos entender melhor sua necessidade e faixa de valor dentro da AGRO BW."
                                />
                                <div className="flex flex-wrap items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => void handleStartConversation(response.responseId)}
                                    disabled={isStartingConversation}
                                    className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                                  >
                                    {isStartingConversation ? 'Abrindo conversa...' : 'Iniciar conversa mediada'}
                                  </button>
                                  <span className="text-xs text-slate-500">
                                    O comprador sera notificado dentro da plataforma e podera responder sem liberar contato direto.
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="text-sm text-slate-600 lg:text-right">
                            <p className="font-semibold text-slate-900">Interesse confirmado</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(response.respondedAt).toLocaleString('pt-BR', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {conversations.length > 0 && (
                <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                      <MessageCircle className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-slate-900">Conversas mediadas</h4>
                      <p className="text-sm text-slate-500">Canal interno entre loja e comprador interessado, sem expor telefone ou e-mail.</p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[320px,1fr]">
                    <div className="space-y-3">
                      {conversations.map((conversation) => (
                        <button
                          key={conversation.conversationId}
                          type="button"
                          onClick={() => void handleOpenConversation(conversation.conversationId)}
                          className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                            selectedConversationId === conversation.conversationId
                              ? 'border-emerald-300 bg-emerald-50'
                              : 'border-slate-200 bg-slate-50 hover:bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-900">{conversation.counterpartName}</p>
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                              {conversation.role === 'seller' ? 'Loja' : 'Comprador'}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {conversation.categorySlug}
                            {conversation.subcategorySlug ? ` / ${conversation.subcategorySlug}` : ''}
                          </p>
                          <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                            {conversation.lastMessagePreview || 'Conversa iniciada. Aguarde a primeira mensagem.'}
                          </p>
                          <p className="mt-3 text-xs text-slate-400">
                            {conversation.lastMessageAt
                              ? new Date(conversation.lastMessageAt).toLocaleString('pt-BR', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })
                              : new Date(conversation.updatedAt).toLocaleString('pt-BR', {
                                  dateStyle: 'short',
                                  timeStyle: 'short',
                                })}
                          </p>
                        </button>
                      ))}
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5">
                      {selectedConversation ? (
                        <>
                          {selectedConversation.role === 'seller' && contactShareByConversationId[selectedConversation.conversationId] ? (
                            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                              <p className="font-semibold">Contato autorizado pelo comprador</p>
                              <div className="mt-2 space-y-1">
                                {contactShareByConversationId[selectedConversation.conversationId].shareEmail &&
                                contactShareByConversationId[selectedConversation.conversationId].sharedEmail ? (
                                  <p>
                                    E-mail: <strong>{contactShareByConversationId[selectedConversation.conversationId].sharedEmail}</strong>
                                  </p>
                                ) : null}
                                {contactShareByConversationId[selectedConversation.conversationId].shareWhatsapp &&
                                contactShareByConversationId[selectedConversation.conversationId].sharedWhatsapp ? (
                                  <p>
                                    WhatsApp: <strong>{contactShareByConversationId[selectedConversation.conversationId].sharedWhatsapp}</strong>
                                  </p>
                                ) : null}
                                {contactShareByConversationId[selectedConversation.conversationId].buyerNote ? (
                                  <p className="mt-2 text-emerald-800">
                                    Observacao do comprador: {contactShareByConversationId[selectedConversation.conversationId].buyerNote}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ) : null}

                          {selectedConversation.role === 'buyer' && !contactShareByConversationId[selectedConversation.conversationId] ? (
                            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                              <p className="font-semibold">Compartilhamento opcional de contato</p>
                              <p className="mt-2 leading-6">
                                Se voce quiser acelerar a negociacao, pode autorizar o compartilhamento do seu e-mail e/ou WhatsApp apenas para esta loja.
                                Esse compartilhamento e especifico para esta conversa.
                              </p>
                              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                                <label className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(shareEmailByConversation[selectedConversation.conversationId])}
                                    onChange={(event) =>
                                      setShareEmailByConversation((current) => ({
                                        ...current,
                                        [selectedConversation.conversationId]: event.target.checked,
                                      }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span>Compartilhar meu e-mail</span>
                                </label>
                                <label className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-white px-4 py-3">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(shareWhatsappByConversation[selectedConversation.conversationId])}
                                    onChange={(event) =>
                                      setShareWhatsappByConversation((current) => ({
                                        ...current,
                                        [selectedConversation.conversationId]: event.target.checked,
                                      }))
                                    }
                                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <span>Compartilhar meu WhatsApp</span>
                                </label>
                              </div>
                              <div className="mt-3 space-y-2">
                                <label className="text-sm font-semibold text-amber-900">Observacao opcional sobre o compartilhamento</label>
                                <textarea
                                  value={shareNotesByConversation[selectedConversation.conversationId] || ''}
                                  onChange={(event) =>
                                    setShareNotesByConversation((current) => ({
                                      ...current,
                                      [selectedConversation.conversationId]: event.target.value,
                                    }))
                                  }
                                  rows={3}
                                  className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700"
                                  placeholder="Ex.: Pode me chamar apos as 14h."
                                />
                              </div>
                              <div className="mt-4 flex flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => void handleGrantContactShare(selectedConversation.conversationId)}
                                  disabled={isGrantingContactShare}
                                  className="inline-flex items-center justify-center rounded-2xl bg-amber-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-200"
                                >
                                  {isGrantingContactShare ? 'Compartilhando...' : 'Autorizar compartilhamento'}
                                </button>
                                <span className="text-xs text-amber-800">
                                  Ao confirmar, a loja passara a ver apenas os canais selecionados.
                                </span>
                              </div>
                            </div>
                          ) : null}

                          {selectedConversation.role === 'buyer' && contactShareByConversationId[selectedConversation.conversationId] ? (
                            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                              <p className="font-semibold">Voce ja compartilhou seus contatos com esta loja</p>
                              <div className="mt-2 space-y-1">
                                {contactShareByConversationId[selectedConversation.conversationId].shareEmail ? (
                                  <p>E-mail autorizado para esta conversa.</p>
                                ) : null}
                                {contactShareByConversationId[selectedConversation.conversationId].shareWhatsapp ? (
                                  <p>WhatsApp autorizado para esta conversa.</p>
                                ) : null}
                                <p className="text-xs text-emerald-800">
                                  Compartilhado em{' '}
                                  {new Date(contactShareByConversationId[selectedConversation.conversationId].grantedAt).toLocaleString('pt-BR', {
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                  })}
                                </p>
                              </div>
                            </div>
                          ) : null}

                          <div className="flex flex-col gap-2 border-b border-slate-200 pb-4">
                            <p className="text-sm font-semibold text-slate-900">{selectedConversation.counterpartName}</p>
                            <p className="text-xs text-slate-500">
                              {selectedConversation.counterpartCity
                                ? `${selectedConversation.counterpartCity}, ${selectedConversation.counterpartState}`
                                : selectedConversation.counterpartState || 'Regiao nao informada'}
                            </p>
                          </div>

                          <div className="mt-4 space-y-3">
                            {loadingConversationId === selectedConversation.conversationId &&
                            !conversationMessages[selectedConversation.conversationId] ? (
                              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                                Carregando conversa mediada...
                              </div>
                            ) : (
                              <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
                                {(conversationMessages[selectedConversation.conversationId] || []).map((message) => {
                                  const isMine = message.senderUserId === user?.id;
                                  return (
                                    <div
                                      key={message.messageId}
                                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                                    >
                                      <div
                                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                                          isMine
                                            ? 'bg-emerald-600 text-white'
                                            : 'border border-slate-200 bg-white text-slate-700'
                                        }`}
                                      >
                                        <p className={`mb-1 text-[11px] font-semibold ${isMine ? 'text-emerald-100' : 'text-slate-400'}`}>
                                          {message.senderName}
                                        </p>
                                        <p>{message.content}</p>
                                        <p className={`mt-2 text-[11px] ${isMine ? 'text-emerald-100' : 'text-slate-400'}`}>
                                          {new Date(message.createdAt).toLocaleString('pt-BR', {
                                            dateStyle: 'short',
                                            timeStyle: 'short',
                                          })}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                            <textarea
                              value={conversationDrafts[selectedConversation.conversationId] || ''}
                              onChange={(event) =>
                                setConversationDrafts((current) => ({
                                  ...current,
                                  [selectedConversation.conversationId]: event.target.value,
                                }))
                              }
                              rows={4}
                              disabled={selectedConversation.status !== 'open'}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 disabled:bg-slate-50"
                              placeholder="Digite sua mensagem mantendo a conversa dentro da AGRO BW."
                            />
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                onClick={() => void handleSendConversationMessage(selectedConversation.conversationId)}
                                disabled={isSendingConversationMessage || selectedConversation.status !== 'open'}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                              >
                                <Send className="h-4 w-4" />
                                {isSendingConversationMessage ? 'Enviando...' : 'Enviar mensagem'}
                              </button>
                              <span className="text-xs text-slate-500">
                                Este canal continua mediado e nao compartilha contatos diretos automaticamente.
                              </span>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                          Selecione uma conversa para continuar o atendimento mediado.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default CommercialIntelligenceDashboard;
