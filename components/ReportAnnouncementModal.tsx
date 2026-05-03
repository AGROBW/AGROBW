import React, { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import type { AnnouncementReportReason } from '../src/hooks/useAnnouncementReports';

interface ReportAnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: AnnouncementReportReason, details?: string) => Promise<void>;
  isSubmitting: boolean;
  announcementTitle: string;
}

const REPORT_REASON_OPTIONS: Array<{ value: AnnouncementReportReason; label: string; description: string }> = [
  {
    value: 'inappropriate_content',
    label: 'Conteúdo impróprio',
    description: 'Imagens, texto ou mídia inadequados para a plataforma.',
  },
  {
    value: 'wrong_category',
    label: 'Categoria incorreta',
    description: 'O anúncio foi publicado em uma categoria ou subcategoria errada.',
  },
  {
    value: 'fraud_or_scam',
    label: 'Possível golpe ou fraude',
    description: 'Há sinais de golpe, fraude ou tentativa de enganar compradores.',
  },
  {
    value: 'false_information',
    label: 'Informação falsa',
    description: 'O anúncio traz informações inconsistentes ou aparentemente falsas.',
  },
  {
    value: 'prohibited_item',
    label: 'Item proibido',
    description: 'O produto ou serviço parece não ser permitido pelas regras da plataforma.',
  },
  {
    value: 'duplicate_or_spam',
    label: 'Duplicado ou spam',
    description: 'O anúncio parece repetido, excessivo ou sem contexto comercial real.',
  },
  {
    value: 'other',
    label: 'Outro motivo',
    description: 'Use esta opção quando a situação não se encaixar nas categorias acima.',
  },
];

const ReportAnnouncementModal: React.FC<ReportAnnouncementModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
  announcementTitle,
}) => {
  const [selectedReason, setSelectedReason] = useState<AnnouncementReportReason>('inappropriate_content');
  const [details, setDetails] = useState('');

  const selectedOption = useMemo(
    () => REPORT_REASON_OPTIONS.find((option) => option.value === selectedReason),
    [selectedReason]
  );

  if (!isOpen) return null;

  const handleClose = () => {
    if (isSubmitting) return;
    setSelectedReason('inappropriate_content');
    setDetails('');
    onClose();
  };

  const handleSubmit = async () => {
    await onSubmit(selectedReason, details);
    setSelectedReason('inappropriate_content');
    setDetails('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-2xl sm:max-w-3xl lg:max-w-4xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-4 pb-4 pt-5 sm:px-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Denunciar anúncio
            </div>
            <h3 className="mt-3 text-xl font-black text-slate-900 sm:text-2xl">Ajude a equipe a revisar este anúncio</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Sua denúncia será registrada uma única vez para este anúncio e ajudará a equipe a decidir se ele deve ir para análise.
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-700">{announcementTitle}</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 pt-5 sm:px-6">
          <div className="grid gap-3 md:grid-cols-2">
            {REPORT_REASON_OPTIONS.map((option) => {
              const isSelected = selectedReason === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setSelectedReason(option.value)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    isSelected
                      ? 'border-rose-300 bg-rose-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <p className={`text-sm font-bold leading-5 ${isSelected ? 'text-rose-800' : 'text-slate-900'}`}>{option.label}</p>
                  <p className={`mt-1 text-xs leading-5 sm:text-sm ${isSelected ? 'text-rose-700' : 'text-slate-500'}`}>{option.description}</p>
                </button>
              );
            })}
          </div>

          <div className="mt-5">
            <label className="mb-2 block text-sm font-bold text-slate-900">
              Observação complementar {selectedOption?.value === 'other' ? '(recomendado)' : '(opcional)'}
            </label>
            <textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              placeholder="Descreva o que chamou sua atenção para ajudar a equipe de moderação."
              className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
            />
          </div>
        </div>

        <div className="border-t border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Confirmar denúncia
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportAnnouncementModal;
