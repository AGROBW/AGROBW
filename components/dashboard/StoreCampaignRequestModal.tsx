import React, { useEffect, useState } from 'react';
import { Megaphone, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface StoreCampaignRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcementTitle: string;
  onSubmit: (subject: string, message: string) => Promise<{ error: string | null }>;
}

const StoreCampaignRequestModal: React.FC<StoreCampaignRequestModalProps> = ({
  isOpen,
  onClose,
  announcementTitle,
  onSubmit,
}) => {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setMessage('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const { error } = await onSubmit(subject, message);
      if (error) {
        toast.error(error || 'Não foi possível enviar a solicitação.');
        return;
      }
      toast.success('Solicitação de campanha enviada para análise.');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <Megaphone className="h-5 w-5" strokeWidth={1.8} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900">Solicitar campanha de e-mail</h2>
              <p className="text-xs text-slate-500">Anúncio: <span className="font-semibold text-slate-700">{announcementTitle}</span></p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
            Sua solicitação passa por análise da equipe antes de qualquer disparo. O conteúdo final do e-mail é montado e
            aprovado pela equipe, e enviado apenas para usuários que consentiram em receber divulgações.
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Assunto sugerido (opcional)</label>
            <input
              type="text"
              value={subject}
              maxLength={200}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex.: Oportunidade: Trator zero em Salvador"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Mensagem/observações (opcional)</label>
            <textarea
              value={message}
              maxLength={2000}
              rows={4}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Conte o que gostaria de destacar nesta campanha."
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-100"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enviar solicitação
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoreCampaignRequestModal;
