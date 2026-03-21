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
  onSuccess?: () => void;
};

const HighlightConfirmationModal: React.FC<HighlightConfirmationModalProps> = ({
  isOpen,
  onClose,
  announcementId,
  announcementTitle,
  highlightType,
  onSuccess
}) => {
  const [isApplying, setIsApplying] = useState(false);
  const { usage, refreshUsage } = useSubscription();
  const { settings } = useLayout();

  const highlightConfig = {
    category: {
      icon: <Tag className="w-6 h-6" />,
      title: 'Destaque em Categoria',
      description: 'Seu anúncio aparecerá em destaque na página da categoria',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      used: usage.categoryHighlightsUsed,
      limit: usage.categoryHighlightsLimit
    },
    home: {
      icon: <Home className="w-6 h-6" />,
      title: 'Destaque na Home',
      description: 'Seu anúncio aparecerá em destaque na página inicial',
      color: '',
      bgColor: '',
      borderColor: '',
      used: usage.homeHighlightsUsed,
      limit: usage.homeHighlightsLimit
    }
  };

  const config = highlightConfig[highlightType];
  const remaining = config.limit - config.used;

  const handleApplyHighlight = async () => {
    if (isApplying) return;

    setIsApplying(true);
    try {
      const { data, error } = await supabase.rpc('apply_announcement_highlight', {
        p_announcement_id: announcementId,
        p_highlight_type: highlightType
      });

      if (error) {
        console.error('[HighlightModal] Erro ao aplicar destaque:', error);
        toast.error('Erro ao aplicar destaque', {
          description: error.message
        });
        return;
      }

      // Verificar resposta da RPC
      if (!data?.success) {
        toast.error('Não foi possível aplicar o destaque', {
          description: data?.error || 'Erro desconhecido'
        });
        return;
      }

      // Sucesso
      toast.success(data.message || 'Destaque aplicado com sucesso!', {
        description: `Restam ${data.remaining || 0} créditos de ${config.title.toLowerCase()} neste ciclo.`
      });

      // Atualizar uso
      await refreshUsage();

      // Callback de sucesso
      if (onSuccess) {
        onSuccess();
      }

      // Fechar modal
      onClose();
    } catch (err: any) {
      console.error('[HighlightModal] Erro inesperado:', err);
      toast.error('Erro inesperado ao aplicar destaque', {
        description: err.message
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
          {/* Header */}
          <div
            className={`${highlightType === 'category' ? `${config.bgColor} ${config.borderColor}` : ''} border-b-2 px-6 py-4 flex items-center justify-between`}
            style={highlightType === 'home' ? { backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 10%, white)`, borderColor: `color-mix(in srgb, ${settings.primaryColor} 22%, white)` } : undefined}
          >
            <div className="flex items-center gap-3">
              <div className={config.color} style={highlightType === 'home' ? { color: settings.primaryColor } : undefined}>
                {config.icon}
              </div>
              <h2 className={`text-xl font-bold ${config.color}`} style={highlightType === 'home' ? { color: settings.primaryColor } : undefined}>
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

          {/* Body */}
          <div className="p-6 space-y-5">
            {/* Anúncio */}
            <div>
              <p className="text-sm text-slate-500 font-medium mb-1">Anúncio:</p>
              <p className="text-base font-semibold text-slate-800">{announcementTitle}</p>
            </div>

            {/* Descrição */}
            <div
              className={`${highlightType === 'category' ? `${config.bgColor} ${config.borderColor}` : ''} border-2 rounded-lg p-4`}
              style={highlightType === 'home' ? { backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)`, borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)` } : undefined}
            >
              <div className="flex items-start gap-3">
                <Sparkles className={`w-5 h-5 ${config.color} flex-shrink-0 mt-0.5`} style={highlightType === 'home' ? { color: settings.primaryColor } : undefined} />
                <p className="text-sm text-slate-700 leading-relaxed">
                  {config.description}
                </p>
              </div>
            </div>

            {/* Alerta sobre créditos */}
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-bold text-amber-900">Atenção:</p>
                  <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                    <li>Este destaque consome <strong>1 crédito</strong> do seu ciclo atual</li>
                    <li>Créditos <strong>não são acumulativos</strong></li>
                    <li>Após aplicado, este anúncio só poderá ser destacado novamente em <strong>15 dias</strong></li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Contador de uso */}
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Uso no Ciclo Atual
                  </p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    {config.used} <span className="text-base text-slate-400">de</span> {config.limit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
                    Restantes
                  </p>
                  <p className={`text-2xl font-bold mt-1 ${remaining > 0 ? '' : 'text-red-600'}`} style={remaining > 0 ? { color: settings.primaryColor } : undefined}>
                    {remaining}
                  </p>
                </div>
              </div>
              
              {/* Barra de progresso */}
              <div className="mt-3 w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full ${remaining > 0 ? '' : 'bg-red-500'} transition-all duration-300`}
                  style={{ width: `${(config.used / config.limit) * 100}%`, backgroundColor: remaining > 0 ? settings.primaryColor : undefined }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
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
              disabled={isApplying || remaining <= 0}
              className={`px-6 py-2 rounded-lg font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                highlightType === 'category'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : ''
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
                  Confirmar Destaque
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
