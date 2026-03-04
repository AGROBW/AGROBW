
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Clock, DollarSign, Eye, Heart, MessageCircle, Share2, ShieldCheck, Calendar, Gauge, Ruler, Weight, Wrench, Hammer, Cog, Circle, MapPin, Package, Truck, Droplet, Zap, Thermometer, Wind } from 'lucide-react';
import { useAd } from '../src/hooks/useAds';
import { useAuth } from '../src/contexts/AuthContext';
import ContactSellerModal from '../components/ContactSellerModal';
import VerifiedBadge from '../components/VerifiedBadge';
import toast from 'react-hot-toast';

// Mapa de ícones para renderizar dinamicamente
const iconMap: Record<string, React.ComponentType<any>> = {
  Calendar, Gauge, Ruler, Weight, Wrench, Hammer, Cog, Circle, MapPin, Package, Truck, Droplet, Zap, Thermometer, Wind
};

const AdDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { ad, isLoading, error } = useAd(id);
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleContactSeller = () => {
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

  const formattedPrice = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(ad.price);

  return (
    <div className="bg-gray-50 pb-20">
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
            {ad.images && ad.images.length > 0 ? (
              <>
                <div className="relative aspect-video rounded-[1.8rem] overflow-hidden">
                  <img 
                    src={ad.images[0]} 
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

          {/* Description Section */}
          <div className="bg-white rounded-3xl p-10 border border-gray-100 shadow-sm space-y-6">
            <div className="flex items-center gap-4">
               <div className="w-1.5 h-8 bg-green-600 rounded-full"></div>
               <h2 className="text-2xl font-black text-slate-900 font-display">Descrição Detalhada</h2>
            </div>
            <div className="text-slate-600 leading-relaxed space-y-4">
              <p className="whitespace-pre-line text-lg">
                {ad.description}
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
                
                {ad.whatsapp && (
                  <a 
                    href={`https://wa.me/${ad.whatsapp.replace(/\D/g, '')}?text=Olá! Tenho interesse no anúncio: ${encodeURIComponent(ad.title)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full py-5 border-2 border-green-600 text-green-600 rounded-2xl font-bold transition-all hover:bg-green-50 active:scale-95"
                  >
                    <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
                    Conversar via WhatsApp
                  </a>
                )}
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
                    {ad.seller?.cidade && ad.seller?.estado && (
                      <p className="text-xs text-slate-500 mt-0.5">{ad.seller.cidade}, {ad.seller.estado}</p>
                    )}
                  </div>
                </div>
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
              </div>
            </div>
            
            <div className="bg-slate-900 p-6 flex items-center justify-center gap-2">
              <ShieldCheck className="w-4 h-4 text-green-500" strokeWidth={1.5} />
              <span className="text-white text-[11px] font-bold uppercase tracking-widest">Negócio 100% Protegido</span>
            </div>
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
    </div>
  );
};

export default AdDetailView;
