
import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Clock, DollarSign, Eye, Flag, Heart, MessageCircle, Share2, ShieldCheck, Calendar, Gauge, Ruler, Weight, Wrench, Hammer, Cog, Circle, MapPin, Package, Truck, Droplet, Zap, Thermometer, Wind } from 'lucide-react';
import { useAd } from '../src/hooks/useAds';
import { useAuth } from '../src/contexts/AuthContext';
import ContactSellerModal from '../components/ContactSellerModal';
import ReportAnnouncementModal from '../components/ReportAnnouncementModal';
import VerifiedBadge from '../components/VerifiedBadge';
import SeoHead from '../components/SeoHead';
import StructuredData from '../components/StructuredData';
import toast from 'react-hot-toast';
import { censorContactData } from '../src/utils/censorContact';
import { useLayout } from '../src/contexts/LayoutContext';
import { getPrimaryImageFromList } from '../src/utils/imageFallback';
import { useAnnouncementReports } from '../src/hooks/useAnnouncementReports';
import { buildAbsoluteSiteUrl } from '../src/lib/siteConfig';

// Mapa de ícones para renderizar dinamicamente
const iconMap: Record<string, React.ComponentType<any>> = {
  Calendar, Gauge, Ruler, Weight, Wrench, Hammer, Cog, Circle, MapPin, Package, Truck, Droplet, Zap, Thermometer, Wind
};

const AdDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { ad, isLoading, error } = useAd(id);
  const { user } = useAuth();
  const { settings } = useLayout();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const { snapshot: reportSnapshot, isSubmitting: isSubmittingReport, submitReport } = useAnnouncementReports(ad?.id);
  const hasAutoOpenedContactModalRef = useRef(false);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const shouldAutoOpenContactSeller = searchParams.get('openContactSeller') === '1';

    if (!shouldAutoOpenContactSeller || !user || !ad || ad.status !== 'ACTIVE' || user.id === ad.userId) {
      return;
    }

    if (!hasAutoOpenedContactModalRef.current) {
      hasAutoOpenedContactModalRef.current = true;
      setIsModalOpen(true);
    }

    searchParams.delete('openContactSeller');
    const cleanedSearch = searchParams.toString();
    const nextUrl = `${location.pathname}${cleanedSearch ? `?${cleanedSearch}` : ''}${location.hash}`;
    navigate(nextUrl, { replace: true });
  }, [ad, location.hash, location.pathname, location.search, navigate, user]);

  const handleContactSeller = () => {
    if (!user) {
      const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
      navigate(`/cadastro?redirect=${encodeURIComponent(redirectTarget)}&intent=contact-seller`);
      return;
    }
    if (!user) {
      toast.error('Para negociar, você precisa estar logado em sua conta.', {
        duration: 4000,
        icon: '🔒'
      });
      return;
    }
    
    if (user.id === ad?.userId) {
      toast.error('Você não pode enviar mensagem para o seu próprio anúncio.');
      return;
    }

    setIsModalOpen(true);
  };

  const handleOpenReportModal = () => {
    if (!user) {
      toast.error('Para denunciar um anúncio, você precisa estar logado em sua conta.', {
        duration: 4000,
        icon: '🔒'
      });
      return;
    }

    if (user.id === ad?.userId) {
      toast.error('Você não pode denunciar o seu próprio anúncio.');
      return;
    }

    if (reportSnapshot.userHasReported) {
      toast.error('Você já registrou uma denúncia para este anúncio.');
      return;
    }

    setIsReportModalOpen(true);
  };

  const handleSubmitReport = async (
    reason: 'inappropriate_content' | 'wrong_category' | 'fraud_or_scam' | 'false_information' | 'prohibited_item' | 'duplicate_or_spam' | 'other',
    details?: string
  ) => {
    try {
      const result = await submitReport(reason, details);
      setIsReportModalOpen(false);

      if (result.sentToReview) {
        toast.success('Denúncia registrada. O anúncio atingiu o limite e foi enviado para análise.');
      } else {
        toast.success(`Denúncia registrada com sucesso. Restam ${Math.max(result.threshold - result.reportCount, 0)} denúncia(s) para análise automática.`);
      }
    } catch (error: any) {
      const message = error?.message || error?.details || error?.hint || 'Não foi possível registrar a denúncia.';
      toast.error(message);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
        <p className="mt-4 text-slate-600">Carregando anúncio...</p>
      </div>
    );
  }

  if (error || !ad) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Anúncio não encontrado</h2>
        <p className="text-slate-600 mb-4">{error || 'O anúncio pode ter sido removido ou não existe.'}</p>
        <Link to="/" className="text-green-700 font-bold hover:underline">Voltar para a home</Link>
      </div>
    );
  }

  if (ad.status !== 'ACTIVE') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" strokeWidth={1.5} />
        <h2 className="text-2xl font-bold text-slate-800 mb-4">Anuncio indisponivel</h2>
        <p className="text-slate-600 mb-4 text-center max-w-xl">
          Este anuncio nao esta mais disponivel para visualizacao publica porque venceu ou saiu do ar.
        </p>
        <Link to="/anuncios" className="text-green-700 font-bold hover:underline">Voltar para anuncios</Link>
      </div>
    );
  }

  const isPriceOnRequest = !!ad.priceNegotiable;
  const priceToDisplay = ad.price > 0 ? ad.price : ((ad as any).unit_price || 0);
  const formattedPrice = isPriceOnRequest
    ? 'Sob consulta'
    : new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(priceToDisplay);
  const safeDescription = censorContactData(ad.description || '').censored;
  const primaryImage = getPrimaryImageFromList(ad.images, settings.defaultAdImageUrl);
  const commercialHighlights = [
    ad.productCondition ? { label: 'Condição', value: ad.productCondition === 'novo' ? 'Novo' : ad.productCondition === 'seminovo' ? 'Seminovo' : 'Usado' } : null,
    ad.availability ? { label: 'Disponibilidade', value: ad.availability === 'pronta_entrega' ? 'Pronta entrega' : ad.availability === 'sob_encomenda' ? 'Sob encomenda' : 'Consultar estoque' } : null,
    ad.acceptsTrade ? { label: 'Negociação', value: 'Aceita troca' } : null,
    ad.hasInvoice ? { label: 'Documentação', value: 'Emite nota fiscal' } : null,
    ad.hasWarranty ? { label: 'Garantia', value: ad.warrantyDetails || 'Garantia informada pela loja' } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  const adStructuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Início',
          item: buildAbsoluteSiteUrl('/'),
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Anúncios',
          item: buildAbsoluteSiteUrl('/anuncios'),
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: ad.title,
          item: buildAbsoluteSiteUrl(`/anuncio/${ad.id}`),
        },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: ad.title,
      description: safeDescription || `Anúncio rural ${ad.title}`,
      image: primaryImage ? [primaryImage] : undefined,
      sku: ad.id,
      brand: ad.seller?.name || 'AGRO BW',
      category: ad.categorySlug || ad.subCategoryLabel || undefined,
      offers: isPriceOnRequest
        ? {
            '@type': 'Offer',
            availability: 'https://schema.org/InStock',
            url: buildAbsoluteSiteUrl(`/anuncio/${ad.id}`),
            priceSpecification: {
              '@type': 'PriceSpecification',
              priceCurrency: 'BRL',
              valueAddedTaxIncluded: false,
              price: 0,
              description: 'Sob consulta',
            },
          }
        : {
            '@type': 'Offer',
            priceCurrency: 'BRL',
            price: priceToDisplay,
            availability: 'https://schema.org/InStock',
            url: buildAbsoluteSiteUrl(`/anuncio/${ad.id}`),
          },
    },
  ];

  return (
    <div className="bg-gray-50 pb-20">
      <SeoHead
        title={ad.title}
        description={(safeDescription || `Veja detalhes do anúncio ${ad.title} no marketplace da AGRO BW.`).slice(0, 160)}
        canonicalPath={`/anuncio/${ad.id}`}
        image={primaryImage}
      />
      <StructuredData id="ad-detail" data={adStructuredData} />
      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 text-sm text-slate-400 font-medium">
          <Link to="/" className="hover:text-green-700">Início</Link>
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-slate-600">Anúncio</span>
          <ChevronRight className="w-4 h-4" strokeWidth={1.5} />
          <span className="text-slate-900 font-bold truncate max-w-[200px] md:max-w-none">{ad.title}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* Left Column: Gallery & Description */}
        <div className="lg:col-span-8 space-y-10">
          
          {/* Gallery Card */}
          <div className="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-gray-100 p-2">
            {primaryImage ? (
              <>
                <div className="relative aspect-video rounded-[1.8rem] overflow-hidden">
                  <img 
                    src={primaryImage} 
                    alt={ad.title} 
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-6 right-6 flex gap-2">
                     <button className="bg-white/90 backdrop-blur-md p-3 rounded-lg text-slate-700 hover:text-red-500 transition-colors">
                       <Heart className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                     <button className="bg-white/90 backdrop-blur-md p-3 rounded-lg text-slate-700 hover:text-blue-500 transition-colors">
                       <Share2 className="w-5 h-5" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
                {/* Gallery Thumbnails */}
                {ad.images.length > 1 && (
                  <div className="flex gap-4 p-6 overflow-x-auto custom-scrollbar">
                    {ad.images.map((img, i) => (
                      <div key={i} className={`flex-shrink-0 w-24 h-20 rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${i === 0 ? 'border-green-600' : 'border-transparent opacity-70 hover:opacity-100'}`}>
                        <img src={img} alt={`${ad.title} - ${i + 1}`} className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="relative aspect-video rounded-[1.8rem] overflow-hidden bg-slate-100 flex items-center justify-center">
                <p className="text-slate-400 text-lg">Sem imagens disponíveis</p>
              </div>
            )}
          </div>

          {ad.videoUrl && (
            <div className="bg-white rounded-[2rem] overflow-hidden shadow-sm border border-gray-100 p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-600">Loja Parceira</p>
                  <h2 className="mt-2 text-2xl font-black text-slate-900 font-display">Vídeo do anúncio</h2>
                </div>
                {ad.videoDurationSeconds ? (
                  <div className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">
                    {ad.videoDurationSeconds}s
                  </div>
                ) : null}
              </div>
              <div className="overflow-hidden rounded-[1.8rem] border border-slate-100 bg-slate-950">
                <video
                  src={ad.videoUrl}
                  controls
                  playsInline
                  preload="metadata"
                  poster={primaryImage || undefined}
                  className="aspect-video w-full bg-slate-950 object-contain"
                />
              </div>
            </div>
          )}

          {/* Technical Specifications Section */}
          {ad.technicalDetails && ad.technicalDetails.length > 0 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-black text-slate-900 font-display px-2">Especificações Técnicas</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                {ad.technicalDetails.map((detail: any, index: number) => {
                  const IconComponent = iconMap[detail.iconName] || Circle;
                  return (
                    <div key={index} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow">
                      <div className="p-3 bg-green-50 text-green-700 rounded-xl">
                        <IconComponent className="w-5 h-5" strokeWidth={1.5} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{detail.label}</p>
                        <p className="text-lg font-black text-slate-800">{detail.value}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {commercialHighlights.length > 0 && (
            <div className="bg-gradient-to-br from-emerald-50 via-white to-slate-50 rounded-3xl border border-emerald-100 p-8 shadow-sm space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-8 bg-emerald-600 rounded-full"></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 font-display">Informações comerciais</h2>
                  <p className="text-sm text-slate-500 mt-1">Detalhes extras informados pela loja sobre este anúncio.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {commercialHighlights.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-emerald-100 bg-white/90 p-5">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{item.label}</p>
                    <p className="text-base font-bold text-slate-800">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description Section */}
          <div className="bg-white rounded-3xl p-10 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-4">
               <div className="w-1.5 h-8 bg-green-600 rounded-full"></div>
               <h2 className="text-2xl font-black text-slate-900 font-display">Descrição Detalhada</h2>
            </div>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p className="whitespace-pre-line text-lg">
                {safeDescription}
              </p>
              <div className="pt-6 border-t border-gray-50 flex items-center gap-2 text-sm font-bold text-slate-400">
                <Clock className="w-4 h-4" strokeWidth={1.5} />
                Anunciado em: {new Date(ad.createdAt).toLocaleDateString('pt-BR')}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: CTA & User info */}
        <div className="lg:col-span-4 space-y-8">
          
          {/* Fixed/Sticky CTA Card */}
          <div className="sticky top-28 bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-gray-100 overflow-hidden">
            <div className="p-8 space-y-8">
              <div>
                <span className="bg-green-100 text-green-700 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest mb-3 inline-block">Valor de Venda</span>
                <h1 className="text-4xl font-black text-slate-900 tracking-tighter">{formattedPrice}</h1>
                <p className="text-slate-400 text-sm mt-2 font-medium flex items-center gap-2">
                  <Eye className="w-4 h-4" strokeWidth={1.5} />
                  {ad.views.toLocaleString()} visualizações totais
                </p>
              </div>

              <div className="space-y-4">
                <button
                  onClick={handleContactSeller}
                  className="flex items-center justify-center gap-3 w-full py-5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black text-lg transition-all shadow-lg shadow-green-600/20 active:scale-95"
                >
                  <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                  Fale com o Vendedor
                </button>
                
              </div>

              <div className="pt-8 border-t border-gray-50 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-xl font-bold text-slate-500 overflow-hidden">
                    {ad.seller?.avatar ? (
                      <img src={ad.seller.avatar} alt={ad.seller?.name || 'Vendedor Profissional'} className="w-full h-full object-cover" />
                    ) : (
                      <span>{(ad.seller?.name || 'Vendedor Profissional')[0].toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900">{ad.seller?.name || 'Vendedor Profissional'}</h4>
                      {ad.seller?.document_verified && <VerifiedBadge variant="icon-only" />}
                    </div>
                    {ad.seller?.document_verified && (
                      <p className="text-xs text-emerald-600 font-semibold mt-0.5">Identidade Verificada</p>
                    )}
                  </div>
                </div>
                {ad.seller?.business_description && (
                  <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">Sobre o vendedor</p>
                    <p className="text-sm leading-6 text-slate-600 whitespace-pre-line">
                      {ad.seller.business_description}
                    </p>
                  </div>
                )}
                {ad.seller?.store?.slug && (
                  <Link
                    to={`/loja/${ad.seller.store.slug}`}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100"
                  >
                    Ver loja parceira
                  </Link>
                )}
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-slate-50 p-3 rounded-xl text-center">
                     <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Local</p>
                     <p className="text-sm font-black text-slate-700">{ad.location.city}, {ad.location.state}</p>
                   </div>
                   <div className="bg-slate-50 p-3 rounded-xl text-center">
                     <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Views</p>
                     <p className="text-sm font-black text-slate-700">{ad.views}</p>
                   </div>
                </div>
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleOpenReportModal}
                    disabled={Boolean(user && reportSnapshot.userHasReported)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      user && reportSnapshot.userHasReported
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-rose-200 hover:bg-rose-50/70 hover:text-rose-700'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          user && reportSnapshot.userHasReported
                            ? 'bg-slate-200 text-slate-400'
                            : 'bg-rose-50 text-rose-600'
                        }`}
                      >
                        <Flag className="h-4 w-4" strokeWidth={1.8} />
                      </span>
                      <span className="flex flex-col">
                        <span className="text-sm font-black leading-5">
                          {user && reportSnapshot.userHasReported ? 'Denúncia já registrada' : 'Denunciar anúncio'}
                        </span>
                        <span className="text-xs font-medium leading-5 text-slate-500">
                          {user && reportSnapshot.userHasReported
                            ? 'Sua sinalização já foi enviada para a equipe.'
                            : 'Informe algo suspeito ou fora das regras da plataforma.'}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className={`h-4 w-4 ${user && reportSnapshot.userHasReported ? 'text-slate-300' : 'text-slate-400'}`} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 px-6 py-6"></div>
          </div>

          {/* Safety Card */}
          <div className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm space-y-4">
             <h3 className="font-bold text-slate-900 flex items-center gap-2">
               <AlertTriangle className="w-5 h-5 text-yellow-500" strokeWidth={1.5} />
                Dicas de Segurança
             </h3>
             <ul className="text-xs text-slate-500 space-y-3">
               <li>• Nunca realize pagamentos antecipados sem ver o produto.</li>
               <li>• Desconfie de preços muito abaixo do mercado.</li>
               <li>• Prefira encontrar o vendedor em locais públicos.</li>
               <li>• Verifique a documentação antes de fechar negócio.</li>
             </ul>
          </div>
        </div>
      </div>

      {/* Modal de Contato */}
      {ad && (
        <ContactSellerModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          announcementId={ad.id}
          announcementTitle={ad.title}
          sellerId={ad.userId}
        />
      )}
      {ad && (
        <ReportAnnouncementModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          onSubmit={handleSubmitReport}
          isSubmitting={isSubmittingReport}
          announcementTitle={ad.title}
        />
      )}
    </div>
  );
};

export default AdDetailView;
