import React, { useEffect, useState } from 'react';
import { CheckCircle, Eye, EyeOff, Loader2, MessageCircle, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { useWhatsappSettings } from '../../../src/hooks/useWhatsappSettings';

const WhatsappNotificationsSection: React.FC = () => {
  const { settings, isLoading, fetchSettings, updateSettings } = useWhatsappSettings();

  const [formData, setFormData] = useState({
    access_token: '',
    phone_number_id: '',
    template_name: '',
    template_lang: 'pt_BR',
    is_enabled: false,
  });
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setFormData({
      access_token: '',
      phone_number_id: settings.phone_number_id || '',
      template_name: settings.template_name || '',
      template_lang: settings.template_lang || 'pt_BR',
      is_enabled: settings.is_enabled || false,
    });
  }, [settings]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { error } = await updateSettings({
        access_token: formData.access_token,
        phone_number_id: formData.phone_number_id,
        template_name: formData.template_name,
        template_lang: formData.template_lang,
        is_enabled: formData.is_enabled,
      });

      if (error) {
        toast.error(`Erro ao salvar: ${error}`);
        return;
      }

      toast.success('Configurações do WhatsApp salvas com sucesso.');
      await fetchSettings();
      setFormData((current) => ({ ...current, access_token: '' }));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-600" />
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
          Notificações
        </p>
        <h2 className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
          <MessageCircle className="h-6 w-6 text-emerald-600" /> WhatsApp do anunciante
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Avisa o anunciante no WhatsApp quando surge um novo interessado (lead). Usa o WhatsApp Cloud
          API oficial da Meta com um template de mensagem aprovado. O envio só ocorre com a chave
          configurada e a integração ativada.
        </p>
      </section>

      <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Token de acesso</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {settings?.access_token_configured ? 'Configurado' : 'Pendente'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {settings?.is_enabled ? 'Ativado' : 'Desativado'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">
              Token de acesso (permanente)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={formData.access_token}
                onChange={(e) => handleChange('access_token', e.target.value)}
                placeholder={settings?.access_token_configured ? 'Token já configurado (deixe vazio para manter)' : 'Cole o token do System User'}
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 pr-11 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">Por segurança, o token nunca é exibido depois de salvo.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Phone Number ID</label>
              <input
                type="text"
                value={formData.phone_number_id}
                onChange={(e) => handleChange('phone_number_id', e.target.value)}
                placeholder="Ex.: 123456789012345"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-slate-700">Idioma do template</label>
              <input
                type="text"
                value={formData.template_lang}
                onChange={(e) => handleChange('template_lang', e.target.value)}
                placeholder="pt_BR"
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-slate-700">Nome do template aprovado</label>
            <input
              type="text"
              value={formData.template_name}
              onChange={(e) => handleChange('template_name', e.target.value)}
              placeholder="Ex.: novo_interessado"
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
            <p className="mt-1 text-xs text-slate-400">
              O template deve ter 3 variáveis no corpo, nesta ordem: {'{{1}}'} nome do anunciante, {'{{2}}'} título do anúncio, {'{{3}}'} nome do interessado.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <input
              type="checkbox"
              checked={formData.is_enabled}
              onChange={(e) => handleChange('is_enabled', e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 accent-emerald-600"
            />
            <span className="text-sm font-semibold text-slate-700">
              Ativar envio de notificações por WhatsApp
            </span>
            {formData.is_enabled ? <CheckCircle className="ml-auto h-5 w-5 text-emerald-600" /> : null}
          </label>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar configurações
          </button>
        </div>
      </form>
    </>
  );
};

export default WhatsappNotificationsSection;
