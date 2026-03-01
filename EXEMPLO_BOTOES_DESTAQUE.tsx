// Este é um exemplo de como adicionar botões de destaque na listagem de anúncios
// Adicione este código no componente AdsDashboard do UserDashboardView.tsx

// 1. Adicione os imports no topo do arquivo:
import HighlightConfirmationModal from '../components/HighlightConfirmationModal';
import { Sparkles, TrendingUp } from 'lucide-react';

// 2. Adicione esses estados dentro do componente AdsDashboard:
const [showHighlightModal, setShowHighlightModal] = useState(false);
const [selectedAdForHighlight, setSelectedAdForHighlight] = useState<{ id: string; title: string } | null>(null);
const [selectedHighlightType, setSelectedHighlightType] = useState<'category' | 'home'>('category');
const { canApplyCategoryHighlight, canApplyHomeHighlight, refreshUsage } = useSubscription();

// 3. Adicione essas funções auxiliares:
const handleOpenHighlightModal = (ad: Ad, type: 'category' | 'home') => {
  setSelectedAdForHighlight({ id: ad.id, title: ad.title });
  setSelectedHighlightType(type);
  setShowHighlightModal(true);
};

// 4. Na renderização dos anúncios, adicione os botões de destaque antes dos botões existentes:

// Dentro do .map((ad) => (
//   <div key={ad.id} className="...">
//     ...
//     <div className="flex items-center gap-4">
//       <span className={...}>{statusLabel[ad.status]}</span>
      
//       {/* ADICIONE AQUI OS BOTÕES DE DESTAQUE */}
//       <div className="flex items-center gap-1 border-r border-slate-200 pr-3">
//         <button
//           onClick={() => handleOpenHighlightModal(ad, 'category')}
//           disabled={!canApplyCategoryHighlight || ad.status !== 'active'}
//           className={`p-2 rounded-lg transition-colors ${
//             ad.highlight_category
//               ? 'bg-blue-100 text-blue-700'
//               : 'hover:bg-blue-50 hover:text-blue-700 text-slate-400'
//           } disabled:opacity-40 disabled:cursor-not-allowed`}
//           title={
//             !canApplyCategoryHighlight
//               ? 'Sem créditos de destaque de categoria'
//               : ad.highlight_category
//               ? 'Destacado na categoria'
//               : 'Destacar na categoria'
//           }
//         >
//           <TrendingUp className="w-4 h-4" strokeWidth={1.5} />
//         </button>
//         <button
//           onClick={() => handleOpenHighlightModal(ad, 'home')}
//           disabled={!canApplyHomeHighlight || ad.status !== 'active'}
//           className={`p-2 rounded-lg transition-colors ${
//             ad.highlight_home
//               ? 'bg-yellow-100 text-yellow-700'
//               : 'hover:bg-yellow-50 hover:text-yellow-700 text-slate-400'
//           } disabled:opacity-40 disabled:cursor-not-allowed`}
//           title={
//             !canApplyHomeHighlight
//               ? 'Sem créditos de destaque na home'
//               : ad.highlight_home
//               ? 'Destacado na home'
//               : 'Destacar na home'
//           }
//         >
//           <Sparkles className="w-4 h-4" strokeWidth={1.5} />
//         </button>
//       </div>

//       {/* Botões existentes: CreditCard, Edit3, PauseCircle, Trash2 */}
//       <div className="flex items-center gap-2 text-slate-400">
//         ...
//       </div>
//     </div>
//   </div>
// ))

// 5. Adicione o modal no final do return do AdsDashboard (antes do </div> de fechamento):

// </AnimatePresence>

// {/* Modal de Confirmação de Destaque */}
// {showHighlightModal && selectedAdForHighlight && (
//   <HighlightConfirmationModal
//     isOpen={showHighlightModal}
//     onClose={() => {
//       setShowHighlightModal(false);
//       setSelectedAdForHighlight(null);
//     }}
//     announcementId={selectedAdForHighlight.id}
//     announcementTitle={selectedAdForHighlight.title}
//     highlightType={selectedHighlightType}
//     onSuccess={async () => {
//       // Recarregar anúncios para mostrar status atualizado
//       await refreshUsage();
//       // Aqui você pode adicionar lógica para recarregar a lista de anúncios
//       // Ex: refetchAds();
//     }}
//   />
// )}

// </div>  {/* Fecha o container do AdsDashboard */}


// RESULTADO VISUAL:
// Cada anúncio terá 2 novos botões antes dos botões de ação:
// - TrendingUp (azul): Destaque na Categoria
// - Sparkles (amarelo): Destaque na Home
//
// Estados dos botões:
// - Cinza claro: Disponível (hover azul/amarelo)
// - Azul/Amarelo cheio: Já está destacado
// - Opaco/desabilitado: Sem créditos ou anúncio não ativo
//
// Ao clicar, abre o modal de confirmação com todas as regras
