import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, FileSignature, Loader2, MessageSquareText, Send, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../src/lib/supabaseClient';
import {
  COMMERCIAL_PROPOSAL_STATUS,
  formatCommercialProposalAmount,
  isCommercialProposalExpired,
  normalizeCommercialProposal,
  validateCommercialProposalInput,
  type CommercialProposal,
} from '../../src/lib/leads/commercialProposal';

interface LeadProposalComposerProps {
  leadId: string;
  isLocked?: boolean;
  onOpenChat: () => void;
}

const getDefaultValidity = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const statusConfig = {
  sent: { label: 'Aguardando resposta', className: 'bg-amber-50 text-amber-700', icon: MessageSquareText },
  accepted: { label: 'Aceita', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  rejected: { label: 'Recusada', className: 'bg-rose-50 text-rose-700', icon: XCircle },
};

const LeadProposalComposer: React.FC<LeadProposalComposerProps> = ({ leadId, isLocked, onOpenChat }) => {
  const [proposals, setProposals] = useState<CommercialProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState('');
  const [validUntil, setValidUntil] = useState(getDefaultValidity);
  const [paymentTerms, setPaymentTerms] = useState('');
  const [deliveryTerms, setDeliveryTerms] = useState('');
  const [notes, setNotes] = useState('');

  const loadProposals = useCallback(async () => {
    if (!leadId || isLocked) {
      setProposals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('lead_commercial_proposals')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao buscar propostas do lead:', error);
      toast.error('Não foi possível carregar o histórico de propostas.');
    } else {
      setProposals((data || []).map(normalizeCommercialProposal).filter(Boolean) as CommercialProposal[]);
    }
    setLoading(false);
  }, [isLocked, leadId]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

  const numericAmount = useMemo(() => Number(String(amount).replace(',', '.')), [amount]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateCommercialProposalInput({
      amount: numericAmount,
      validUntil,
      paymentTerms,
      deliveryTerms,
      notes,
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.rpc('create_lead_commercial_proposal', {
      p_lead_id: leadId,
      p_amount: numericAmount,
      p_valid_until: validUntil,
      p_payment_terms: paymentTerms.trim() || null,
      p_delivery_terms: deliveryTerms.trim() || null,
      p_notes: notes.trim() || null,
    });

    if (error) {
      console.error('Erro ao criar proposta:', error);
      toast.error('Não foi possível enviar a proposta.', { description: error.message });
    } else {
      toast.success('Proposta enviada na conversa.');
      setAmount('');
      setPaymentTerms('');
      setDeliveryTerms('');
      setNotes('');
      setValidUntil(getDefaultValidity());
      await loadProposals();
    }
    setSubmitting(false);
  };

  if (isLocked) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Proposta comercial rápida</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">Renove o acesso a este contato para criar e consultar propostas.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/50">
      <div className="border-b border-emerald-100 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <FileSignature className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Proposta comercial rápida</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Envie valor e condições em um cartão organizado dentro da conversa.</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-slate-700">
            Valor da proposta
            <div className="mt-1.5 flex rounded-xl border border-slate-200 bg-white focus-within:border-emerald-400">
              <span className="px-3 py-2.5 text-sm font-bold text-slate-400">R$</span>
              <input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" className="min-w-0 flex-1 rounded-r-xl px-2 py-2.5 text-sm font-bold outline-none" required />
            </div>
          </label>
          <label className="text-xs font-bold text-slate-700">
            Válida até
            <input type="date" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-400" required />
          </label>
        </div>
        <input value={paymentTerms} onChange={(event) => setPaymentTerms(event.target.value)} maxLength={500} placeholder="Condições de pagamento (opcional)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
        <input value={deliveryTerms} onChange={(event) => setDeliveryTerms(event.target.value)} maxLength={500} placeholder="Prazo ou condição de entrega (opcional)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Observações e detalhes da negociação (opcional)" className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-400" />
        <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-60">
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar proposta na conversa
        </button>
        <p className="text-[10px] leading-4 text-slate-400">A aceitação registra o interesse do comprador, mas não cria cobrança nem contrato automaticamente.</p>
      </form>

      <div className="border-t border-emerald-100 bg-white/70 px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Histórico</p>
          <button type="button" onClick={onOpenChat} className="text-xs font-bold text-emerald-700 hover:text-emerald-800">Ver conversa</button>
        </div>
        {loading ? (
          <Loader2 className="mx-auto mt-4 h-4 w-4 animate-spin text-emerald-600" />
        ) : proposals.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">Nenhuma proposta enviada para este lead.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {proposals.slice(0, 3).map((proposal) => {
              const expired = isCommercialProposalExpired(proposal);
              const config = expired ? { label: 'Expirada', className: 'bg-slate-100 text-slate-600', icon: CalendarDays } : statusConfig[proposal.status];
              const StatusIcon = config.icon;
              return (
                <div key={proposal.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-3">
                  <div><p className="text-sm font-black text-slate-900">{formatCommercialProposalAmount(proposal.amount)}</p><p className="mt-0.5 text-[10px] text-slate-400">Válida até {new Date(`${proposal.validUntil}T12:00:00`).toLocaleDateString('pt-BR')}</p></div>
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${config.className}`}><StatusIcon className="h-3 w-3" />{config.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadProposalComposer;
