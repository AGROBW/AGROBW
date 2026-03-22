import React, { useState } from 'react';
import { SupportTicketCategory, SupportTicketPriority } from '../../types';

type HelpCenterNewTicketTabProps = {
  onCreateTicket: (input: {
    subject: string;
    category: SupportTicketCategory;
    priority: SupportTicketPriority;
    description: string;
  }) => Promise<{ success: boolean; message?: string; ticketId?: string }>;
};

const categories: Array<{ value: SupportTicketCategory; label: string }> = [
  { value: 'announcements', label: 'Anuncios' },
  { value: 'billing', label: 'Financeiro' },
  { value: 'plans', label: 'Planos' },
  { value: 'messages', label: 'Mensagens' },
  { value: 'technical', label: 'Tecnico' },
  { value: 'other', label: 'Outro' },
];

const priorities: Array<{ value: SupportTicketPriority; label: string }> = [
  { value: 'low', label: 'Baixa' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const HelpCenterNewTicketTab: React.FC<HelpCenterNewTicketTabProps> = ({ onCreateTicket }) => {
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('announcements');
  const [priority, setPriority] = useState<SupportTicketPriority>('medium');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    const result = await onCreateTicket({ subject, category, priority, description });
    if (result.success) {
      setSubject('');
      setCategory('announcements');
      setPriority('medium');
      setDescription('');
    }
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Novo ticket</h2>
          <p className="text-sm text-slate-500 mt-2">
            Descreva sua duvida com o maximo de contexto para acelerar o atendimento.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Assunto</label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="w-full h-11 rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/20"
              placeholder="Ex.: Meu anuncio expirou antes do previsto"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">Categoria</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as SupportTicketCategory)}
              className="w-full h-11 rounded-xl border border-slate-200 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/20"
            >
              {categories.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Prioridade</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {priorities.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPriority(item.value)}
                className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                  priority === item.value
                    ? 'border-green-700 bg-green-50 text-green-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-semibold text-slate-700">Descreva sua solicitacao</label>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={8}
            className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/20 resize-none"
            placeholder="Explique o problema, informe paginas, IDs ou comportamento esperado."
            required
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !subject.trim() || !description.trim()}
            className="h-11 px-5 rounded-xl bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Abrindo ticket...' : 'Abrir ticket'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default HelpCenterNewTicketTab;
