import React, { useState } from 'react';
import { X, AlertTriangle, Sparkles, Home, Tag } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../src/lib/supabaseClient';
import { toast } from 'sonner';
import { useSubscription } from '../src/hooks/useSubscription';
import { useLayout } from '../src/contexts/LayoutContext';

type HighlightType = 'category' | 'home';

type HighlightConfirmationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
  announcementTitle: string;
  highlightType: HighlightType;
  hasCategoryHighlight?: boolean;
  hasHomeHighlight?: boolean;
  onSuccess?: () => void;
};

const HighlightConfirmationModal: React.FC<HighlightConfirmationModalProps> = ({
  isOpen,
  onClose,
  announcementId,
  announcementTitle,
  highlightType,
  hasCategoryHighlight = false,
  hasHomeHighlight = false,
  onSuccess,
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const { usage, refreshUsage } = useSubscription();
  const { settings } = useLayout();

  const highlightConfig = {
    category: {
      icon: <Tag className="w-6 h-6" />,
      title: 'Destaque em Categoria',
      description: 'Seu anuncio aparecera em destaque na pagina da categoria.',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      used: usage.categoryHighlightsUsed,
      limit: usage.categoryHighlightsLimit,
      boosterRemaining: usage.categoryHighlightsBoosterRemaining,
    },
    home: {
      icon: <Home className="w-6 h-6" />,
      title: 'Destaque na Home',
      description: 'Seu anuncio aparecera em destaque na pagina inicial.',
      color: '',
      bgColor: '',
      borderColor: '',
      used: usage.homeHighlightsUsed,
      limit: usage.homeHighlightsLimit,
      boosterRemaining: usage.homeHighlightsBoosterRemaining,
    },
  };

  const config = highlightConfig[highlightType];
  const remainingPlanCredits = Math.max(config.limit - config.used, 0);
  const totalAvailableCredits = remainingPlanCredits + config.boosterRemaining;
  const conflictingHighlightType = highlightType === 'category' ? 'home' : 'category';
  const hasConflictingHighlight = highlightType === 'category' ? hasHomeHighlight : hasCategoryHighlight;
  const conflictMessage =
    highlightType === 'category'
      ? 'Este anuncio ja esta destacado na Home. Remova ou aguarde o fim do destaque atual para usar destaque em Categoria.'
      : 'Este anuncio ja esta destacado em Categoria. Remova ou aguarde o fim do destaque atual para usar destaque na Home.';

  const handleApplyHighlight = async () => {
    if (isApplying || hasConflictingHighlight) return;

    setIsApplying(true);
    try {
      const { data, error } = await supabase.rpc('apply_announcement_highlight', {
        p_announcement_id: announcementId,
        p_highlight_type: highlightType,
      });

      if (error) {
        console.error('[HighlightModal] Erro ao aplicar destaque:', error);
        toast.error('Erro ao aplicar destaque', {
          description: error.message,
        });
        return;
      }

      if (!data?.success) {
        toast.error('Nao foi possivel aplicar o destaque', {
          description: data?.error || 'Erro desconhecido',
        });
        return;
      }

      toast.success(data.message || 'Destaque aplicado com sucesso!', {
        description:
          data?.credit_source === 'booster'
            ? `Credito extra consumido com sucesso. Restam ${data?.booster_remaining || 0} credito(s) extra(s).`
            : `Restam ${data?.remaining || 0} credito(s) do plano e ${data?.booster_remaining || 0} credito(s) extra(s).`,
      });

      await refreshUsage();

      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (err: any) {
      console.error('[HighlightModal] Erro inesperado:', err);
      toast.error('Erro inesperado ao aplicar destaque', {
        description: err.message,
      });
    } finally {
      setIsApplying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
        >
          <div
            className={`${highlightType === 'category' ? `${config.bgColor} ${config.borderColor}` : ''} border-b-2 px-6 py-4 flex items-center justify-between`}
            style={
              highlightType === 'home'
                ? {
                    backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 10%, white)`,
                    borderColor: `color-mix(in srgb, ${settings.primaryColor} 22%, white)`,
                  }
                : undefined
            }
          >
            <div className="flex items-center gap-3">
              <div
                className={config.color}
                style={highlightType === 'home' ? { color: settings.primaryColor } : undefined}
              >
                {config.icon}
              </div>
              <h2
                className={`text-xl font-bold ${config.color}`}
                style={highlightType === 'home' ? { color: settings.primaryColor } : undefined}
              >
                {config.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              disabled={isApplying}
              className="text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div>
              <p className="text-sm text-slate-500 font-medium mb-1">Anuncio:</p>
              <p className="text-base font-semibold text-slate-800">{announcementTitle}</p>
            </div>

            <div
              className={`${highlightType === 'category' ? `${config.bgColor} ${config.borderColor}` : ''} border-2 rounded-lg p-4`}
              style={
                highlightType === 'home'
                  ? {
                      backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)`,
                      borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
                    }
                  : undefined
              }
            >
              <div className="flex items-start gap-3">
                <Sparkles
                  className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`}
                  style={highlightType === 'home' ? { color: settings.primaryColor } : undefined}
                />
                <p className="text-sm text-slate-700 leading-relaxed">{config.description}</p>
              </div>
            </div>

            <div
              className={`rounded-lg border-2 p-4 ${
                hasConflictingHighlight
                  ? 'border-red-200 bg-red-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <AlertTriangle
                  className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                    hasConflictingHighlight ? 'text-red-600' : 'text-emerald-600'
                  }`}
                />
                <div className="space-y-1">
                  <p
                    className={`text-sm font-bold ${
                      hasConflictingHighlight ? 'text-red-900' : 'text-emerald-900'
                    }`}
                  >
                    {hasConflictingHighlight ? 'Destaque bloqueado' : 'Regra de exclusividade'}
                  </p>
                  <p
                    className={`text-sm leading-relaxed ${
                      hasConflictingHighlight ? 'text-red-800' : 'text-emerald-800'
                    }`}
                  >
                    {hasConflictingHighlight
                      ? conflictMessage
                      : `Um anuncio nao pode receber destaque em ${conflictingHighlightType === 'home' ? 'Home' : 'Categoria'} e ${highlightType === 'home' ? 'Home' : 'Categoria'} ao mesmo tempo. Escolha apenas um tipo por vez.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-bold text-amber-900">Atencao:</p>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    <li>O sistema consome primeiro os creditos do seu plano.</li>
                    <li>Quando o ciclo acabar, o consumo continua pelos creditos extras do booster.</li>
                    <li>O novo cooldown de 15 dias comeca somente depois que este destaque vencer.</li>
                    <li>Exemplo: se o destaque expirar em 16/05, o mesmo anuncio so podera receber novo destaque deste tipo a partir de 31/05.</li>
                    <li>O anuncio precisa estar sem destaque do tipo oposto para seguir com esta acao.</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Uso no ciclo atual
                  </p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {config.used} <span className="text-base text-slate-400">de</span> {config.limit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Total disponivel
                  </p>
                  <p
                    className={`text-2xl font-bold mt-1 ${totalAvailableCredits > 0 ? '' : 'text-red-600'}`}
                    style={totalAvailableCredits > 0 ? { color: settings.primaryColor } : undefined}
                  >
                    {totalAvailableCredits}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="block uppercase tracking-wide text-slate-400 font-semibold">Plano</span>
                  <span className="font-bold text-slate-900">{remainingPlanCredits} restante(s)</span>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="block uppercase tracking-wide text-slate-400 font-semibold">Booster</span>
                  <span className="font-bold text-slate-900">{config.boosterRemaining} extra(s)</span>
                </div>
              </div>

              {config.limit > 0 && (
                <div className="mt-3 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full ${remainingPlanCredits > 0 ? '' : 'bg-red-500'} transition-all duration-300`}
                    style={{
                      width: `${Math.min((config.used / config.limit) * 100, 100)}%`,
                      backgroundColor: remainingPlanCredits > 0 ? settings.primaryColor : undefined,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="bg-slate-50 px-6 py-4 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              onClick={onClose}
              disabled={isApplying}
              className="px-4 py-2 rounded-lg font-medium text-slate-700 hover:bg-slate-200 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleApplyHighlight}
              disabled={isApplying || totalAvailableCredits <= 0 || hasConflictingHighlight}
              className={`px-6 py-2 rounded-lg font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                highlightType === 'category' ? 'bg-blue-600 hover:bg-blue-700' : ''
              }`}
              style={highlightType === 'home' ? { backgroundColor: settings.primaryColor } : undefined}
            >
              {isApplying ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Aplicando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Confirmar destaque
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default HighlightConfirmationModal;
