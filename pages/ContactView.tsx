import React, { useState } from 'react';
import { Check, Clock, Loader2, Mail, MapPin, MessageCircle } from 'lucide-react';
import { useContactPage, CONTACT_PAGE_FALLBACK } from '../src/hooks/useContactPage';
import { supabase } from '../src/lib/supabaseClient';

const ContactView: React.FC = () => {
  const { content, isLoading } = useContactPage();
  const data = content || CONTACT_PAGE_FALLBACK;

  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('sending');
    setFormError(null);

    try {
      const { data: messageId, error } = await supabase.rpc('submit_contact_message', {
        p_name: formData.name,
        p_email: formData.email,
        p_phone: formData.phone,
        p_subject: formData.subject || null,
        p_message: formData.message,
      });

      if (error) {
        throw error;
      }

      if (messageId) {
        void supabase.functions
          .invoke('send-contact-form-emails', {
            body: { messageId },
          })
          .catch((dispatchError) => {
            console.error('[ContactView] Falha ao disparar e-mail do contato:', dispatchError);
          });
      }

      setFormStatus('success');
      setFormData({ name: '', email: '', phone: '', subject: '', message: '' });
      window.setTimeout(() => setFormStatus('idle'), 5000);
    } catch (error: any) {
      console.error('[ContactView] Erro ao enviar mensagem:', error);
      setFormStatus('error');
      setFormError(error?.message || 'Não foi possível enviar sua mensagem agora. Tente novamente em instantes.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-12 w-12 animate-spin text-green-600" />
      </div>
    );
  }

  const subjectOptions = (data.form_subject_options ||
    'Suporte Tecnico\nDuvidas sobre Planos\nParcerias Comerciais\nSugestoes e Elogios\nDenunciar Anuncio')
    .split('\n')
    .filter((option) => option.trim());

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-slate-900 py-16 text-white">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h1 className="mb-3 text-xl font-semibold">{data.page_title}</h1>
          <p className="mx-auto max-w-2xl text-sm text-slate-400">{data.page_subtitle}</p>
        </div>
      </section>

      <section className="-mt-8 mb-16 px-4">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-5">
            <div className="rounded-xl border border-slate-100 bg-white p-5">
              <h2 className="mb-5 text-xl font-semibold text-slate-900">Canais de Atendimento</h2>

              <div className="space-y-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <MessageCircle className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{data.whatsapp_label}</p>
                    <a
                      href={`https://wa.me/${data.whatsapp_number.replace(/\D/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-slate-800 transition-colors hover:text-green-600"
                    >
                      {data.whatsapp_number}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <Mail className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{data.email_label}</p>
                    <a
                      href={`mailto:${data.email_address}`}
                      className="text-sm font-semibold text-slate-800 transition-colors hover:text-green-600"
                    >
                      {data.email_address}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                    <MapPin className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-slate-400">{data.address_label}</p>
                    <p className="text-sm font-semibold leading-tight text-slate-800">{data.address_full}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t border-slate-100 pt-5 text-slate-500">
                  <Clock className="h-5 w-5 text-green-600" strokeWidth={1.5} />
                  <p className="text-sm font-semibold">{data.schedule_text}</p>
                </div>
              </div>
            </div>

            <div className="h-56 overflow-hidden rounded-xl border border-slate-100 bg-white p-2">
              <iframe
                src={data.maps_embed_url}
                width="100%"
                height="100%"
                style={{ border: 0, borderRadius: '0.75rem' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-xl border border-slate-100 bg-white p-6">
              <h2 className="mb-6 text-xl font-semibold text-slate-900">{data.form_title}</h2>

              {formStatus === 'success' ? (
                <div className="animate-in fade-in zoom-in py-12 text-center duration-500">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-green-100 text-green-600">
                    <Check className="h-7 w-7" strokeWidth={1.5} />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-slate-900">Mensagem Enviada!</h3>
                  <p className="text-sm text-slate-500">Agradecemos seu contato. Nossa equipe responderá em breve.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {formStatus === 'error' && formError ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {formError}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Nome Completo
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="h-10 w-full rounded-lg border-none bg-slate-50 px-4 outline-none transition-all focus:ring-2 focus:ring-green-500"
                        placeholder={data.form_name_placeholder}
                      />
                    </div>
                    <div>
                      <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        E-mail
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="h-10 w-full rounded-lg border-none bg-slate-50 px-4 outline-none transition-all focus:ring-2 focus:ring-green-500"
                        placeholder={data.form_email_placeholder}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Telefone
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="h-10 w-full rounded-lg border-none bg-slate-50 px-4 outline-none transition-all focus:ring-2 focus:ring-green-500"
                        placeholder={data.form_phone_placeholder}
                      />
                    </div>
                    <div>
                      <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                        Assunto
                      </label>
                      <select
                        value={formData.subject}
                        onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                        className="h-10 w-full rounded-lg border-none bg-slate-50 px-4 outline-none transition-all focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">{data.form_subject_placeholder || 'Selecione o assunto'}</option>
                        {subjectOptions.map((option, index) => (
                          <option key={`${option}-${index}`} value={option.trim()}>
                            {option.trim()}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 ml-1 block text-xs font-semibold uppercase tracking-widest text-slate-400">
                      Mensagem
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                      className="w-full resize-none rounded-lg border-none bg-slate-50 px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-green-500"
                      placeholder={data.form_message_placeholder}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={formStatus === 'sending'}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-green-700 text-sm font-semibold text-white transition-all hover:bg-green-800 disabled:opacity-70"
                  >
                    {formStatus === 'sending' ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-t-2 border-white" />
                        Enviando Mensagem...
                      </>
                    ) : (
                      data.form_button_text
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ContactView;
