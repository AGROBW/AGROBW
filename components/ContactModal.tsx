import React, { useState, useEffect } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import InputMask from 'react-input-mask';
import { supabase } from '../src/supabaseClient';
import toast from 'react-hot-toast';

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  announcementId: string;
  announcementTitle: string;
  sellerId: string;
  buyerId: string;
  buyerData?: {
    name?: string;
    email?: string;
    phone?: string;
    cep?: string;
  };
}

const ContactModal: React.FC<ContactModalProps> = ({
  isOpen,
  onClose,
  announcementId,
  announcementTitle,
  sellerId,
  buyerId,
  buyerData
}) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    cep: '',
    message: '',
    acceptTerms: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Autopreencher dados do usuário logado
  useEffect(() => {
    if (buyerData) {
      setFormData(prev => ({
        ...prev,
        name: buyerData.name || '',
        email: buyerData.email || '',
        phone: buyerData.phone || '',
        cep: buyerData.cep || ''
      }));
    }
  }, [buyerData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.acceptTerms) {
      toast.error('Você precisa aceitar os termos e condições.');
      return;
    }

    if (!formData.message.trim()) {
      toast.error('Por favor, escreva uma mensagem.');
      return;
    }

    setIsSubmitting(true);

    try {
      console.log('[Contact] Verificando chat existente...');
      
      // 1. Verificar se já existe chat entre buyer e seller para este anúncio
      const { data: existingChat, error: chatError } = await supabase
        .from('chats')
        .select('id')
        .eq('announcement_id', announcementId)
        .eq('buyer_id', buyerId)
        .eq('seller_id', sellerId)
        .maybeSingle();

      if (chatError && chatError.code !== 'PGRST116') {
        console.error('[Contact] Erro ao verificar chat:', chatError);
        throw chatError;
      }

      let chatId = existingChat?.id;

      // 2. Se não existe, criar novo chat
      if (!chatId) {
        console.log('[Contact] Criando novo chat...');
        
        const { data: newChat, error: createChatError } = await supabase
          .from('chats')
          .insert({
            announcement_id: announcementId,
            buyer_id: buyerId,
            seller_id: sellerId,
            status: 'pending'
          })
          .select('id')
          .single();

        if (createChatError) {
          console.error('[Contact] Erro ao criar chat:', createChatError);
          throw createChatError;
        }

        chatId = newChat.id;
        console.log('[Contact] Chat criado:', chatId);

        // 3. Criar lead associado ao chat
        const { error: leadError } = await supabase
          .from('leads')
          .insert({
            chat_id: chatId,
            announcement_id: announcementId,
            buyer_id: buyerId,
            seller_id: sellerId,
            buyer_name: formData.name,
            buyer_email: formData.email,
            buyer_phone: formData.phone,
            buyer_cep: formData.cep,
            initial_message: formData.message,
            status: 'new'
          });

        if (leadError) {
          console.error('[Contact] Erro ao criar lead:', leadError);
          throw leadError;
        }

        console.log('[Contact] Lead criado com sucesso');
      }

      // 4. Inserir mensagem
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_id: buyerId,
          content: formData.message,
          is_read: false
        });

      if (messageError) {
        console.error('[Contact] Erro ao enviar mensagem:', messageError);
        throw messageError;
      }

      console.log('[Contact] Mensagem enviada com sucesso');

      toast.success('Mensagem enviada com sucesso!', {
        description: 'O vendedor receberá sua mensagem em breve.'
      });

      // Resetar formulário e fechar modal
      setFormData(prev => ({
        ...prev,
        message: '',
        acceptTerms: false
      }));
      onClose();

    } catch (error: any) {
      console.error('[Contact] Erro ao processar contato:', error);
      toast.error('Erro ao enviar mensagem', {
        description: error.message || 'Tente novamente mais tarde.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = 
    formData.name.trim() &&
    formData.email.trim() &&
    formData.phone.replace(/\D/g, '').length >= 10 &&
    formData.message.trim() &&
    formData.acceptTerms;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="sticky top-0 bg-white border-b border-gray-100 p-6 flex items-center justify-between rounded-t-3xl">
                <div>
                  <h2 className="text-2xl font-black text-slate-900">Fale com o Vendedor</h2>
                  <p className="text-sm text-slate-500 mt-1">Sobre: {announcementTitle}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nome */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Nome Completo <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      readOnly={!!buyerData?.name}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all disabled:bg-gray-50"
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
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      readOnly={!!buyerData?.email}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all disabled:bg-gray-50"
                      placeholder="seu@email.com"
                      required
                    />
                  </div>

                  {/* Telefone */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      Telefone/WhatsApp <span className="text-red-500">*</span>
                    </label>
                    <InputMask
                      mask="(99) 99999-9999"
                      value={formData.phone}
                      onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      readOnly={!!buyerData?.phone}
                    >
                      {(inputProps: any) => (
                        <input
                          {...inputProps}
                          type="tel"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all disabled:bg-gray-50"
                          placeholder="(00) 00000-0000"
                          required
                        />
                      )}
                    </InputMask>
                  </div>

                  {/* CEP */}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">
                      CEP
                    </label>
                    <InputMask
                      mask="99999-999"
                      value={formData.cep}
                      onChange={(e) => setFormData(prev => ({ ...prev, cep: e.target.value }))}
                      readOnly={!!buyerData?.cep}
                    >
                      {(inputProps: any) => (
                        <input
                          {...inputProps}
                          type="text"
                          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all disabled:bg-gray-50"
                          placeholder="00000-000"
                        />
                      )}
                    </InputMask>
                  </div>
                </div>

                {/* Mensagem */}
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    Mensagem <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={formData.message}
                    onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all resize-none"
                    placeholder={`Olá! Tenho interesse em "${announcementTitle}". Poderia me fornecer mais informações?`}
                    rows={4}
                    required
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    {formData.message.length}/500 caracteres
                  </p>
                </div>

                {/* Termos */}
                <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl">
                  <input
                    type="checkbox"
                    id="acceptTerms"
                    checked={formData.acceptTerms}
                    onChange={(e) => setFormData(prev => ({ ...prev, acceptTerms: e.target.checked }))}
                    className="mt-1 w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    required
                  />
                  <label htmlFor="acceptTerms" className="text-sm text-slate-600 cursor-pointer">
                    Li e aceito os{' '}
                    <a href="/termos" target="_blank" className="text-green-600 font-bold hover:underline">
                      Termos de Uso
                    </a>{' '}
                    e a{' '}
                    <a href="/privacidade" target="_blank" className="text-green-600 font-bold hover:underline">
                      Política de Privacidade
                    </a>
                    . <span className="text-red-500">*</span>
                  </label>
                </div>

                {/* Botões */}
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-4 px-6 border-2 border-gray-200 text-slate-600 rounded-xl font-bold hover:bg-gray-50 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={!isFormValid || isSubmitting}
                    className="flex-1 py-4 px-6 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
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
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ContactModal;
