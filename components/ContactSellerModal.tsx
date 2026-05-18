import React, { useEffect, useState } from 'react';
import { X, Send, AlertCircle } from 'lucide-react';
import { supabase } from '../src/lib/supabaseClient';
import { useAuth } from '../src/contexts/AuthContext';
import { toast } from 'sonner';
import { LEAD_STATUS, CHAT_STATUS } from '../constants/status';
import { useLayout } from '../src/contexts/LayoutContext';
import { isTimestampExpired, syncTrustedTime } from '../src/lib/trustedTime';
import { recordContactLegalConsents } from '../src/lib/legalConsents';
import { debugLog } from '../src/utils/debugLog';
import { appError, appWarn } from '../src/utils/appLogger';

const applyPhoneMask = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3').trim();
  }
  return numbers.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3').trim();
};

const applyCepMask = (value: string) => {
  const numbers = value.replace(/\D/g, '');
  return numbers.replace(/(\d{5})(\d{0,3})/, '$1-$2').trim();
};

interface ContactSellerModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
  announcementTitle: string;
  sellerId: string;
}

const ContactSellerModal: React.FC<ContactSellerModalProps> = ({
  isOpen,
  onClose,
  announcementId,
  announcementTitle,
  sellerId,
}) => {
  const { user } = useAuth();
  const { settings } = useLayout();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cep: '',
    message: '',
  });

  useEffect(() => {
    if (isOpen && user) {
      const fetchUserData = async () => {
        const { data, error } = await supabase
          .from('users')
          .select('name, email, phone, cep')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          setFormData({
            name: data.name || '',
            email: data.email || '',
            phone: data.phone || '',
            cep: data.cep || '',
            message: `Ola, tenho interesse no anuncio: ${announcementTitle}`,
          });
        }
      };

      fetchUserData();
    }
  }, [isOpen, user, announcementTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      toast.error('Voce precisa estar logado para enviar mensagens.', {
        description: 'Entre na sua conta e tente novamente para falar com o vendedor.',
      });
      return;
    }

    if (!acceptedTerms) {
      toast.error('Aceite os termos antes de continuar.', {
        description: 'Marque a confirmacao de termos para liberar o envio da mensagem.',
      });
      return;
    }

    if (user.id === sellerId) {
      toast.error('Nao e possivel falar com o seu proprio anuncio.', {
        description: 'Esse contato e exclusivo para compradores interessados.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { error: consentError } = await recordContactLegalConsents({
        announcementId,
        sellerId,
        buyerId: user.id,
      });

      if (consentError) {
        appError('[LegalConsent] Erro ao registrar aceite juridico do contato', consentError, {
          announcementId,
          sellerId,
          buyerId: user.id,
        });
        toast.error('Nao foi possivel registrar o aceite dos termos.', {
          description: 'Tente novamente antes de enviar sua mensagem ao vendedor.',
        });
        return;
      }

      await syncTrustedTime();

      const { data: announcementData, error: announcementError } = await supabase
        .from('announcements')
        .select('status, expires_at')
        .eq('id', announcementId)
        .single();

      if (announcementError || !announcementData) {
        toast.error('Nao foi possivel validar o anuncio antes do contato.', {
          description: 'Atualize a pagina e tente novamente em seguida.',
        });
        return;
      }

      const isExpiredByDate = isTimestampExpired(announcementData.expires_at);

      if (announcementData.status !== 'ACTIVE' || isExpiredByDate) {
        toast.error('Este anuncio nao aceita novos contatos.', {
          description: 'O anuncio expirou ou nao esta mais ativo na plataforma.',
        });
        return;
      }

      const { data: existingChat, error: checkError } = await supabase
        .from('chats')
        .select('id')
        .eq('announcement_id', announcementId)
        .eq('buyer_id', user.id)
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (checkError) {
        appError('[Chat] Erro ao verificar chat existente', checkError, {
          announcementId,
          sellerId,
          buyerId: user.id,
        });
        toast.error('Erro ao verificar conversas existentes.', {
          description: 'Tente novamente daqui a pouco.',
        });
        return;
      }

      let chatId = existingChat?.id;
      let existingLeadId: string | null = null;

      if (!chatId) {
        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({
            announcement_id: announcementId,
            buyer_id: user.id,
            seller_id: sellerId,
            status: CHAT_STATUS.NOVO,
            last_message: formData.message,
            last_message_time: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (chatError) {
          appError('[Chat] Erro ao criar chat', chatError, {
            announcementId,
            sellerId,
            buyerId: user.id,
          });

          let errorMessage = 'Nao foi possivel iniciar a conversa.';

          if (chatError.code === '23505') {
            errorMessage = 'Voce ja possui uma conversa aberta para este anuncio.';
          } else if (chatError.code === '23503') {
            errorMessage = 'Dados invalidos. Recarregue a pagina e tente novamente.';
          } else if (chatError.message?.includes('constraint')) {
            errorMessage = 'Erro de validacao. Verifique seus dados e tente novamente.';
          }

          toast.error(errorMessage, {
            description: 'Revise os dados do contato e tente novamente.',
          });
          return;
        }

        chatId = newChat.id;

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('name, email, phone, cep')
          .eq('id', user.id)
          .single();

        if (userError) {
          appWarn('[Lead] Erro ao buscar dados do usuario', {
            announcementId,
            sellerId,
            buyerId: user.id,
            error: userError,
          });
        }

        const buyerName = formData.name?.trim() || userData?.name?.trim() || user.email?.split('@')[0] || 'Comprador';
        const buyerEmail = formData.email?.trim() || userData?.email?.trim() || user.email || '';
        const buyerPhone = formData.phone?.trim() || userData?.phone?.trim() || null;
        const buyerCep = formData.cep?.trim() || userData?.cep?.trim() || null;

        const { data: leadData, error: leadError } = await supabase
          .from('leads')
          .insert({
            chat_id: chatId,
            announcement_id: announcementId,
            buyer_id: user.id,
            seller_id: sellerId,
            buyer_name: buyerName,
            buyer_email: buyerEmail,
            buyer_phone: buyerPhone,
            buyer_cep: buyerCep,
            initial_message: formData.message,
            status: LEAD_STATUS.NEW,
          })
          .select('id')
          .single();

        if (leadError) {
          appError('[Lead] Erro ao criar lead', leadError, {
            announcementId,
            sellerId,
            buyerId: user.id,
            chatId,
          });
          toast.error('Erro ao registrar interesse.', {
            description: 'Nao foi possivel criar o lead deste contato. Tente novamente.',
          });
          return;
        }

          debugLog('[Lead] Lead criado com sucesso. ID:', leadData.id);
      } else {
        const { data: existingLead, error: existingLeadError } = await supabase
          .from('leads')
          .select('id')
          .eq('chat_id', chatId)
          .maybeSingle();

        if (existingLeadError) {
          appError('[Lead] Erro ao verificar lead existente', existingLeadError, {
            announcementId,
            sellerId,
            buyerId: user.id,
            chatId,
          });
          toast.error('Erro ao validar o contato.', {
            description: 'Nao foi possivel confirmar o lead dessa conversa. Tente novamente.',
          });
          return;
        }

        existingLeadId = existingLead?.id ?? null;

        if (!existingLeadId) {
          const { data: userData, error: userError } = await supabase
            .from('users')
            .select('name, email, phone, cep')
            .eq('id', user.id)
            .single();

          if (userError) {
            appWarn('[Lead] Erro ao buscar dados do usuario para recriar lead', {
              announcementId,
              sellerId,
              buyerId: user.id,
              chatId,
              error: userError,
            });
          }

          const buyerName = formData.name?.trim() || userData?.name?.trim() || user.email?.split('@')[0] || 'Comprador';
          const buyerEmail = formData.email?.trim() || userData?.email?.trim() || user.email || '';
          const buyerPhone = formData.phone?.trim() || userData?.phone?.trim() || null;
          const buyerCep = formData.cep?.trim() || userData?.cep?.trim() || null;

          const { data: recoveredLead, error: recoveredLeadError } = await supabase
            .from('leads')
            .insert({
              chat_id: chatId,
              announcement_id: announcementId,
              buyer_id: user.id,
              seller_id: sellerId,
              buyer_name: buyerName,
              buyer_email: buyerEmail,
              buyer_phone: buyerPhone,
              buyer_cep: buyerCep,
              initial_message: formData.message,
              status: LEAD_STATUS.NEW,
            })
            .select('id')
            .single();

          if (recoveredLeadError) {
            appError('[Lead] Erro ao recriar lead ausente', recoveredLeadError, {
              announcementId,
              sellerId,
              buyerId: user.id,
              chatId,
            });
            toast.error('Erro ao registrar interesse.', {
              description: 'Nao foi possivel recriar o lead desta conversa. Tente novamente.',
            });
            return;
          }

          existingLeadId = recoveredLead.id;
          debugLog('[Lead] Lead ausente recriado com sucesso. ID:', existingLeadId);
        }
      }

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content: formData.message,
          is_read: false,
        });

      if (messageError) {
        appError('[Message] Erro ao enviar mensagem', messageError, {
          announcementId,
          sellerId,
          buyerId: user.id,
          chatId,
        });
        toast.error('Erro ao enviar mensagem.', {
          description: 'A conversa nao foi atualizada. Tente novamente em instantes.',
        });
        return;
      }

      toast.success('Mensagem enviada com sucesso.', {
        description: 'O vendedor recebeu seu contato e a conversa foi iniciada com sucesso.',
      });

      onClose();

      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          phone: '',
          cep: '',
          message: '',
        });
        setAcceptedTerms(false);
      }, 300);
    } catch (error) {
      appError('[Contact] Erro inesperado', error, {
        announcementId,
        sellerId,
        buyerId: user.id,
      });
      toast.error('Erro ao processar sua solicitacao.', {
        description: 'Algo saiu do esperado durante o contato com o vendedor.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    formData.name.trim() !== '' &&
    formData.email.trim() !== '' &&
    formData.message.trim() !== '' &&
    acceptedTerms;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-gray-100 bg-white p-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Fale com o Vendedor</h2>
            <p className="mt-1 text-sm text-slate-500">Envie uma mensagem sobre este anuncio</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 transition-colors hover:bg-gray-100">
            <X className="h-6 w-6 text-slate-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 p-6">
          <div
            className="flex items-start gap-3 rounded-2xl border p-4"
            style={{
              backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 8%, white)`,
              borderColor: `color-mix(in srgb, ${settings.primaryColor} 18%, white)`,
            }}
          >
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" style={{ color: settings.primaryColor }} />
            <div className="text-sm" style={{ color: settings.textColor }}>
              <p className="mb-1 font-bold">Seus dados estao protegidos</p>
              <p style={{ color: settings.secondaryColor }}>
                As informacoes abaixo serao compartilhadas apenas com o vendedor deste anuncio.
              </p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Nome Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              readOnly={!!user}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all disabled:cursor-not-allowed disabled:bg-gray-50"
              style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
              placeholder="Seu nome completo"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              E-mail <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              readOnly={!!user}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all disabled:cursor-not-allowed disabled:bg-gray-50"
              style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
              placeholder="seu@email.com"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">Telefone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  const masked = applyPhoneMask(e.target.value);
                  setFormData({ ...formData, phone: masked });
                }}
                readOnly={!!user}
                maxLength={15}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all read-only:cursor-not-allowed read-only:bg-gray-50"
                style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                placeholder="(00) 00000-0000"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">CEP</label>
              <input
                type="text"
                value={formData.cep}
                onChange={(e) => {
                  const masked = applyCepMask(e.target.value);
                  setFormData({ ...formData, cep: masked });
                }}
                readOnly={!!user}
                maxLength={9}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all read-only:cursor-not-allowed read-only:bg-gray-50"
                style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                placeholder="00000-000"
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700">
              Mensagem <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 outline-none transition-all"
              style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
              rows={5}
              placeholder="Escreva sua mensagem para o vendedor..."
              required
            />
            <p className="mt-2 text-xs text-slate-400">{formData.message.length} caracteres</p>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="terms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300"
              style={{ accentColor: settings.primaryColor }}
            />
            <label htmlFor="terms" className="text-sm text-slate-600">
              Li e aceito os{' '}
              <a href="/termos" target="_blank" className="font-bold hover:underline" style={{ color: settings.primaryColor }}>
                Termos de Uso
              </a>{' '}
              e a{' '}
              <a href="/privacidade" target="_blank" className="font-bold hover:underline" style={{ color: settings.primaryColor }}>
                Politica de Privacidade
              </a>
              <span className="ml-1 text-red-500">*</span>
            </label>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border-2 border-gray-200 px-6 py-3 font-bold text-slate-700 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl px-6 py-3 font-bold text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-300"
              style={{ backgroundColor: settings.primaryColor }}
            >
              {isSubmitting ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-5 w-5" />
                  Enviar Mensagem
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContactSellerModal;
