import React, { useState, useEffect } from 'react';
import { MessageCircle, Save, RotateCcw, AlertCircle, Loader2, Phone, Mail, MapPin, Clock, Plus, X } from 'lucide-react';
import { useContactPage, UpdateContactPageData } from '../../src/hooks/useContactPage';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import toast from 'react-hot-toast';

const ContactPageManagement: React.FC = () => {
  const { content, isLoading, updateContent } = useContactPage();
  const { user } = useAuth();
  const { logAction } = useAdminAudit();

  const [formData, setFormData] = useState<UpdateContactPageData>({});
  const [saving, setSaving] = useState(false);
  const [isEditingOptions, setIsEditingOptions] = useState(false);
  const [newOption, setNewOption] = useState('');

  useEffect(() => {
    if (content) {
      setFormData({
        page_title: content.page_title,
        page_subtitle: content.page_subtitle,
        whatsapp_label: content.whatsapp_label,
        whatsapp_number: content.whatsapp_number,
        email_label: content.email_label,
        email_address: content.email_address,
        address_label: content.address_label,
        address_full: content.address_full,
        schedule_text: content.schedule_text,
        maps_embed_url: content.maps_embed_url,
        form_title: content.form_title,
        form_name_placeholder: content.form_name_placeholder,
        form_email_placeholder: content.form_email_placeholder,
        form_phone_placeholder: content.form_phone_placeholder,
        form_subject_placeholder: content.form_subject_placeholder,
        form_subject_options: content.form_subject_options,
        form_message_placeholder: content.form_message_placeholder,
        form_button_text: content.form_button_text,
        form_recipient_email: content.form_recipient_email,
      });
    }
  }, [content]);

  const handleChange = (field: keyof UpdateContactPageData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error('Você precisa estar logado');
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateContent(formData, user.id);

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      // Log de auditoria
      await logAction({
        action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
        resourceType: RESOURCE_TYPES.PAGE,
        resourceId: content?.id || '',
        newValue: { page: 'Fale Conosco', ...formData },
        reason: 'Conteúdo da página Fale Conosco atualizado',
      });

      toast.success('Página "Fale Conosco" atualizada com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar:', err);
      toast.error('Erro inesperado ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (content) {
      setFormData({
        page_title: content.page_title,
        page_subtitle: content.page_subtitle,
        whatsapp_label: content.whatsapp_label,
        whatsapp_number: content.whatsapp_number,
        email_label: content.email_label,
        email_address: content.email_address,
        address_label: content.address_label,
        address_full: content.address_full,
        schedule_text: content.schedule_text,
        maps_embed_url: content.maps_embed_url,
        form_title: content.form_title,
        form_name_placeholder: content.form_name_placeholder,
        form_email_placeholder: content.form_email_placeholder,
        form_phone_placeholder: content.form_phone_placeholder,
        form_subject_placeholder: content.form_subject_placeholder,
        form_subject_options: content.form_subject_options,
        form_message_placeholder: content.form_message_placeholder,
        form_button_text: content.form_button_text,
        form_recipient_email: content.form_recipient_email,
      });
      toast.success('Alterações descartadas');
    }
  };

  // Funções para gerenciar opções do select
  const getSubjectOptions = (): string[] => {
    return (formData.form_subject_options || '').split('\n').filter(opt => opt.trim());
  };

  const addSubjectOption = () => {
    if (!newOption.trim()) {
      toast.error('Digite uma opção válida');
      return;
    }
    
    const currentOptions = getSubjectOptions();
    if (currentOptions.includes(newOption.trim())) {
      toast.error('Esta opção já existe');
      return;
    }

    const updatedOptions = [...currentOptions, newOption.trim()].join('\n');
    handleChange('form_subject_options', updatedOptions);
    setNewOption('');
    toast.success('Opção adicionada');
  };

  const removeSubjectOption = (index: number) => {
    const currentOptions = getSubjectOptions();
    const updatedOptions = currentOptions.filter((_, i) => i !== index).join('\n');
    handleChange('form_subject_options', updatedOptions);
    toast.success('Opção removida');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="w-6 h-6 text-green-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Página "Fale Conosco"</h2>
            <p className="text-sm text-gray-500">
              Edite o conteúdo da página de contato
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            <RotateCcw className="w-4 h-4" />
            Descartar Alterações
          </button>

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Seção Hero */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">🎯 Seção Hero</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título da Página
              </label>
              <input
                type="text"
                value={formData.page_title || ''}
                onChange={(e) => handleChange('page_title', e.target.value)}
                placeholder="Fale Conosco"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Subtítulo
              </label>
              <textarea
                value={formData.page_subtitle || ''}
                onChange={(e) => handleChange('page_subtitle', e.target.value)}
                rows={2}
                placeholder="Estamos aqui para ajudar você a colher os melhores resultados..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Canais de Atendimento */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">📞 Canais de Atendimento</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* WhatsApp */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <Phone className="w-4 h-4" />
                <span className="font-semibold text-sm">WhatsApp</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_label || ''}
                  onChange={(e) => handleChange('whatsapp_label', e.target.value)}
                  placeholder="WHATSAPP"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Número
                </label>
                <input
                  type="text"
                  value={formData.whatsapp_number || ''}
                  onChange={(e) => handleChange('whatsapp_number', e.target.value)}
                  placeholder="(11) 99999-9999"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* E-mail */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <Mail className="w-4 h-4" />
                <span className="font-semibold text-sm">E-mail</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={formData.email_label || ''}
                  onChange={(e) => handleChange('email_label', e.target.value)}
                  placeholder="E-MAIL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Endereço de E-mail
                </label>
                <input
                  type="email"
                  value={formData.email_address || ''}
                  onChange={(e) => handleChange('email_address', e.target.value)}
                  placeholder="suporte@bwagro.com.br"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <MapPin className="w-4 h-4" />
                <span className="font-semibold text-sm">Endereço</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Label
                </label>
                <input
                  type="text"
                  value={formData.address_label || ''}
                  onChange={(e) => handleChange('address_label', e.target.value)}
                  placeholder="ENDEREÇO SEDE"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={formData.address_full || ''}
                  onChange={(e) => handleChange('address_full', e.target.value)}
                  placeholder="Av. Paulista, 1000 - Bela Vista, São Paulo - SP"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Horário */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600">
                <Clock className="w-4 h-4" />
                <span className="font-semibold text-sm">Horário de Atendimento</span>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Texto do Horário
                </label>
                <input
                  type="text"
                  value={formData.schedule_text || ''}
                  onChange={(e) => handleChange('schedule_text', e.target.value)}
                  placeholder="Segunda a Sexta, das 08h às 18h"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Google Maps */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              URL de Incorporação do Google Maps
            </label>
            <input
              type="url"
              value={formData.maps_embed_url || ''}
              onChange={(e) => handleChange('maps_embed_url', e.target.value)}
              placeholder="https://www.google.com/maps/embed?pb=..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Cole a URL de incorporação do Google Maps (iframe src)
            </p>
          </div>
        </div>

        {/* Formulário */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">✉️ Formulário de Contato</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Título do Formulário
              </label>
              <input
                type="text"
                value={formData.form_title || ''}
                onChange={(e) => handleChange('form_title', e.target.value)}
                placeholder="Envie sua Mensagem"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Placeholder - Nome
                </label>
                <input
                  type="text"
                  value={formData.form_name_placeholder || ''}
                  onChange={(e) => handleChange('form_name_placeholder', e.target.value)}
                  placeholder="Seu nome"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Placeholder - E-mail
                </label>
                <input
                  type="text"
                  value={formData.form_email_placeholder || ''}
                  onChange={(e) => handleChange('form_email_placeholder', e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Placeholder - Telefone
                </label>
                <input
                  type="text"
                  value={formData.form_phone_placeholder || ''}
                  onChange={(e) => handleChange('form_phone_placeholder', e.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Placeholder - Assunto
                </label>
                <input
                  type="text"
                  value={formData.form_subject_placeholder || ''}
                  onChange={(e) => handleChange('form_subject_placeholder', e.target.value)}
                  placeholder="Selecione o assunto"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Opções do Select "Assunto"
              </label>
              
              {!isEditingOptions ? (
                <div className="space-y-3">
                  <select 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent bg-white"
                    disabled
                  >
                    <option>{formData.form_subject_placeholder || 'Selecione o assunto'}</option>
                    {getSubjectOptions().map((option, index) => (
                      <option key={index}>{option}</option>
                    ))}
                  </select>
                  
                  <button
                    type="button"
                    onClick={() => setIsEditingOptions(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-semibold hover:bg-green-100 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Gerenciar Opções
                  </button>
                </div>
              ) : (
                <div className="space-y-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  {/* Lista de opções atuais */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Opções atuais</p>
                    {getSubjectOptions().length === 0 ? (
                      <p className="text-sm text-slate-400 italic py-2">Nenhuma opção cadastrada</p>
                    ) : (
                      <div className="space-y-1">
                        {getSubjectOptions().map((option, index) => (
                          <div 
                            key={index}
                            className="flex items-center justify-between bg-white px-3 py-2 rounded border border-slate-200 group"
                          >
                            <span className="text-sm text-slate-700">{option}</span>
                            <button
                              type="button"
                              onClick={() => removeSubjectOption(index)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded"
                              title="Remover opção"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Input para adicionar nova opção */}
                  <div className="pt-3 border-t border-slate-200">
                    <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Adicionar nova opção</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newOption}
                        onChange={(e) => setNewOption(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSubjectOption())}
                        placeholder="Digite a nova opção..."
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={addSubjectOption}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar
                      </button>
                    </div>
                  </div>

                  {/* Botão para fechar */}
                  <button
                    type="button"
                    onClick={() => setIsEditingOptions(false)}
                    className="w-full px-4 py-2 bg-slate-600 text-white rounded-lg text-sm font-semibold hover:bg-slate-700 transition-colors"
                  >
                    Concluir
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                E-mail Destinatário <span className="text-xs text-gray-500">(onde os contatos serão enviados)</span>
              </label>
              <input
                type="email"
                value={formData.form_recipient_email || ''}
                onChange={(e) => handleChange('form_recipient_email', e.target.value)}
                placeholder="contato@bwagro.com.br"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                ⚠️ <strong>Atenção:</strong> Atualmente o formulário não envia emails automaticamente. Para implementar o envio real, é necessário configurar um backend/API.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Placeholder - Mensagem
              </label>
              <input
                type="text"
                value={formData.form_message_placeholder || ''}
                onChange={(e) => handleChange('form_message_placeholder', e.target.value)}
                placeholder="Como podemos ajudar?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Texto do Botão
              </label>
              <input
                type="text"
                value={formData.form_button_text || ''}
                onChange={(e) => handleChange('form_button_text', e.target.value)}
                placeholder="Enviar Mensagem"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-1">💡 Dicas de Edição:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>O layout e as cores da página são fixos no código.</li>
              <li>Você pode editar apenas o conteúdo textual dos campos.</li>
              <li>Para o mapa, obtenha a URL de incorporação no Google Maps (Compartilhar → Incorporar um mapa).</li>
              <li>O formulário funciona independentemente destes textos (apenas placeholders).</li>
            </ul>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ContactPageManagement;
