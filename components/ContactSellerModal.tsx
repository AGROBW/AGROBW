import React, { useState, useEffect } from 'react';
import { X, Send, AlertCircle, Check } from 'lucide-react';
import { supabase } from '../src/lib/supabaseClient';
import { useAuth } from '../src/contexts/AuthContext';
import toast from 'react-hot-toast';

// Funções de máscara
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
  sellerId
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cep: '',
    message: ''
  });

  // Autopreenchimento com dados do usuário
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
            message: `Olá, tenho interesse no anúncio: ${announcementTitle}`
          });
        }
      };

      fetchUserData();
    }
  }, [isOpen, user, announcementTitle]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast.error('Você precisa estar logado para enviar mensagens.');
      return;
    }

    if (!acceptedTerms) {
      toast.error('Você precisa aceitar os termos e condições.');
      return;
    }

    if (user.id === sellerId) {
      toast.error('Você não pode enviar mensagem para o seu próprio anúncio.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Verificar se já existe um chat
      const { data: existingChat, error: checkError } = await supabase
        .from('chats')
        .select('id')
        .eq('announcement_id', announcementId)
        .eq('buyer_id', user.id)
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (checkError) {
        console.error('[Chat] Erro ao verificar chat existente:', checkError);
        toast.error('Erro ao verificar conversas existentes.');
        setIsSubmitting(false);
        return;
      }

      let chatId = existingChat?.id;

      // 2. Se não existe chat, criar um novo
      if (!chatId) {
        console.log('[Chat] Criando novo chat...', {
          announcement_id: announcementId,
          buyer_id: user.id,
          seller_id: sellerId
        });

        const { data: newChat, error: chatError } = await supabase
          .from('chats')
          .insert({
            announcement_id: announcementId,
            buyer_id: user.id,
            seller_id: sellerId,
            status: 'novo',
            last_message: formData.message,
            last_message_time: new Date().toISOString()
          })
          .select('id')
          .single();

        if (chatError) {
          console.error('[Chat] Erro ao criar chat:', chatError);
          console.error('[Chat] Detalhes do erro:', JSON.stringify(chatError, null, 2));
          
          let errorMessage = 'Não foi possível iniciar a conversa.';
          
          if (chatError.code === '23505') {
            errorMessage = 'Você já possui uma conversa aberta para este anúncio.';
          } else if (chatError.code === '23503') {
            errorMessage = 'Dados inválidos. Por favor, recarregue a página e tente novamente.';
          } else if (chatError.message?.includes('constraint')) {
            errorMessage = 'Erro de validação. Verifique seus dados e tente novamente.';
          }
          
          toast.error(errorMessage);
          setIsSubmitting(false);
          return;
        }

        chatId = newChat.id;
        console.log('[Chat] Chat criado com sucesso! ID:', chatId);

        // 3. Criar lead vinculado ao chat (OBRIGATÓRIO)
        console.log('[Lead] Criando lead...', {
          chat_id: chatId,
          announcement_id: announcementId,
          buyer_id: user.id,
          seller_id: sellerId,
          buyer_name: formData.name,
          buyer_email: formData.email,
          buyer_phone: formData.phone || null,
          buyer_cep: formData.cep || null
        });

        const { data: leadData, error: leadError } = await supabase
          .from('leads')
          .insert({
            chat_id: chatId,
            announcement_id: announcementId,
            buyer_id: user.id,
            seller_id: sellerId,
            buyer_name: formData.name,
            buyer_email: formData.email,
            buyer_phone: formData.phone || null,
            buyer_cep: formData.cep || null,
            initial_message: formData.message,
            status: 'new'
          })
          .select('id')
          .single();

        if (leadError) {
          console.error('[Lead] ERRO ao criar lead:', leadError);
          console.error('[Lead] Detalhes do erro:', JSON.stringify(leadError, null, 2));
          toast.error('Erro ao registrar interesse. Tente novamente.');
          setIsSubmitting(false);
          return;
        }

        console.log('[Lead] Lead criado com sucesso! ID:', leadData.id);
      } else {
        console.log('[Chat] Chat já existe. ID:', chatId);
        
        // Verificar se já existe lead para este chat
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('chat_id', chatId)
          .maybeSingle();
        
        if (existingLead) {
          console.log('[Lead] Lead já existe para este chat. ID:', existingLead.id);
        } else {
          console.log('[Lead] AVISO: Chat existe mas não tem lead vinculado!');
        }
      }

      // 4. Enviar mensagem
      console.log('[Message] Enviando mensagem...', {
        chat_id: chatId,
        sender_id: user.id,
        content_length: formData.message.length
      });

      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: user.id,
          content: formData.message,
          is_read: false
        });

      if (messageError) {
        console.error('[Message] Erro ao enviar mensagem:', messageError);
        console.error('[Message] Detalhes do erro:', JSON.stringify(messageError, null, 2));
        toast.error('Erro ao enviar mensagem.');
        setIsSubmitting(false);
        return;
      }

      console.log('[Message] Mensagem enviada com sucesso!');
      console.log('[Contact] ✅ Fluxo completo executado com sucesso!');

      // TODO: Integração futura com WhatsApp
      // await sendWhatsAppNotification(sellerId, formData.message);

      toast.success('Mensagem enviada! O vendedor receberá uma notificação.');

      onClose();
      
      // Limpar formulário após fechar
      setTimeout(() => {
        setFormData({
          name: '',
          email: '',
          phone: '',
          cep: '',
          message: ''
        });
        setAcceptedTerms(false);
      }, 300);

    } catch (error) {
      console.error('[Contact] Erro inesperado:', error);
      toast.error('Erro ao processar sua solicitação.');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex items-center justify-between rounded-t-3xl z-10">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Fale com o Vendedor</h2>
            <p className="text-sm text-slate-500 mt-1">Envie uma mensagem sobre este anúncio</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              <p className="font-bold mb-1">Seus dados estão protegidos</p>
              <p className="text-blue-700">As informações abaixo serão compartilhadas apenas com o vendedor deste anúncio.</p>
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Nome Completo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              readOnly={!!user}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
              placeholder="Seu nome completo"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              E-mail <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              readOnly={!!user}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all outline-none disabled:bg-gray-50 disabled:cursor-not-allowed"
              placeholder="seu@email.com"
              required
            />
          </div>

          {/* Telefone e CEP */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Telefone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => {
                  const masked = applyPhoneMask(e.target.value);
                  setFormData({ ...formData, phone: masked });
                }}
                readOnly={!!user}
                maxLength={15}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all outline-none disabled:bg-gray-50 disabled:cursor-not-allowed read-only:bg-gray-50 read-only:cursor-not-allowed"
                placeholder="(00) 00000-0000"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                CEP
              </label>
              <input
                type="text"
                value={formData.cep}
                onChange={(e) => {
                  const masked = applyCepMask(e.target.value);
                  setFormData({ ...formData, cep: masked });
                }}
                readOnly={!!user}
                maxLength={9}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all outline-none disabled:bg-gray-50 disabled:cursor-not-allowed read-only:bg-gray-50 read-only:cursor-not-allowed"
                placeholder="00000-000"
              />
            </div>
          </div>

          {/* Mensagem */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              Mensagem <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-500/20 transition-all outline-none resize-none"
              rows={5}
              placeholder="Escreva sua mensagem para o vendedor..."
              required
            />
            <p className="text-xs text-slate-400 mt-2">
              {formData.message.length} caracteres
            </p>
          </div>

          {/* Checkbox Termos */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="terms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <label htmlFor="terms" className="text-sm text-slate-600">
              Li e aceito os{' '}
              <a href="/termos" target="_blank" className="text-green-600 font-bold hover:underline">
                Termos de Uso
              </a>{' '}
              e a{' '}
              <a href="/privacidade" target="_blank" className="text-green-600 font-bold hover:underline">
                Política de Privacidade
              </a>
              <span className="text-red-500 ml-1">*</span>
            </label>
          </div>

          {/* Botões */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-6 rounded-xl border-2 border-gray-200 text-slate-700 font-bold hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
              className="flex-1 py-3 px-6 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
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
