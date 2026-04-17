
import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Crown,
  Eye,
  Layers3,
  Mail,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLayout } from '../src/contexts/LayoutContext';
import { supabase } from '../src/lib/supabaseClient';

const SUPPORT_EMAIL = 'suporte@bwagro.com.br';

const normalizeExternalUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const buildWhatsAppUrl = (baseUrl: string | null, message: string) => {
  if (!baseUrl) return null;
  const encodedMessage = encodeURIComponent(message);
  if (baseUrl.includes('wa.me/') || baseUrl.includes('api.whatsapp.com')) {
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}text=${encodedMessage}`;
  }
  return baseUrl;
};

const statCards = [
  { value: 'Topo do site', label: 'Posicionamento premium para a sua marca' },
  { value: '6 vagas', label: 'Máximo de patrocinadores simultâneos' },
  { value: 'Lead direto', label: 'Clique para site ou WhatsApp comercial' },
];

const benefitCards = [
  {
    icon: Eye,
    title: 'Mais exposição',
    description: 'Sua marca aparece em uma área premium logo no primeiro contato do comprador com o marketplace.',
  },
  {
    icon: MousePointerClick,
    title: 'Mais cliques',
    description: 'O banner patrocinado disputa atenção no momento em que o usuário está explorando oportunidades reais.',
  },
  {
    icon: Target,
    title: 'Leads qualificados',
    description: 'Você recebe interesse de quem já está pesquisando soluções dentro do seu nicho de atuação.',
  },
  {
    icon: TrendingUp,
    title: 'Mais conversão',
    description: 'A jornada encurta: o comprador sai do banner direto para o seu site ou para o seu WhatsApp comercial.',
  },
];

const exclusiveFeatures = [
  {
    icon: Crown,
    title: 'Destaque no topo do site',
    description: 'Seu banner entra em um carrossel premium de alta visibilidade, valorizando a marca logo na abertura da plataforma.',
  },
  {
    icon: Users,
    title: 'Geração de leads qualificados',
    description: 'Você não compra tráfego vazio. Você se posiciona diante de usuários com intenção concreta de compra.',
  },
  {
    icon: MessageCircle,
    title: 'Redirecionamento direto',
    description: 'Leve o usuário para o seu site institucional ou para o WhatsApp e acelere o início da conversa comercial.',
  },
  {
    icon: BadgeCheck,
    title: 'Exclusividade por nicho',
    description: 'A proposta privilegia segmentos distintos para reduzir concorrência direta e ampliar a atenção sobre a sua marca.',
  },
];

const metrics = [
  { icon: Eye, title: 'Impressões', description: 'Quantas vezes o banner foi exibido para compradores.' },
  { icon: MousePointerClick, title: 'Cliques', description: 'Interações que demonstram interesse real no seu patrocínio.' },
  { icon: BarChart3, title: 'CTR', description: 'Taxa de cliques para medir a eficiência do criativo.' },
  { icon: MessageCircle, title: 'Contatos no WhatsApp', description: 'Quantidade de redirecionamentos iniciados diretamente.' },
  { icon: MapPin, title: 'Região principal', description: 'Localização dominante do público com maior interesse.' },
];

const steps = [
  'Sua empresa reserva um dos espaços disponíveis.',
  'Seu banner entra no carrossel premium do topo do site.',
  'Compradores visualizam, clicam e seguem para o seu canal de contato.',
  'Você acompanha métricas reais e converte o interesse em oportunidade comercial.',
];

const SponsorLandingView: React.FC = () => {
  const { settings } = useLayout();
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    segment: '',
    message: '',
  });

  const whatsappUrl = normalizeExternalUrl(settings.whatsappUrl);
  const brandName = settings.siteName || 'AGRO BW';

  const contactMessage = useMemo(() => {
    return [
      `Olá, equipe ${brandName}.`,
      'Tenho interesse em reservar um espaço de patrocinador.',
      '',
      `Empresa: ${form.companyName || '-'}`,
      `Responsável: ${form.contactName || '-'}`,
      `E-mail: ${form.email || '-'}`,
      `Telefone: ${form.phone || '-'}`,
      `Segmento: ${form.segment || '-'}`,
      `Mensagem: ${form.message || '-'}`,
    ].join('\n');
  }, [brandName, form]);

  const handleFieldChange = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validateForm = () => {
    if (!form.companyName.trim() || !form.contactName.trim() || !form.email.trim() || !form.segment.trim()) {
      toast.error('Preencha empresa, responsável, e-mail e segmento antes de continuar.');
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      toast.error('Digite um e-mail válido para receber o retorno da equipe.');
      return false;
    }

    return true;
  };

  const submitSponsorInterestLead = async (preferredChannel: 'whatsapp' | 'email') => {
    try {
      setIsSubmittingLead(true);

      const { error } = await supabase.from('sponsor_interest_leads').insert({
        company_name: form.companyName.trim(),
        contact_name: form.contactName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        segment: form.segment.trim(),
        message: form.message.trim() || null,
        preferred_channel: preferredChannel,
        source: 'sponsor_landing',
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('[SponsorLandingView] Erro ao registrar interesse de patrocinador:', error);
      toast.error('Não foi possível registrar seu interesse agora. Tente novamente em instantes.');
      return false;
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleWhatsAppCta = async () => {
    if (!validateForm()) return;
    const saved = await submitSponsorInterestLead('whatsapp');
    if (!saved) return;

    const link = buildWhatsAppUrl(whatsappUrl, contactMessage);
    if (!link) {
      toast.error('O WhatsApp comercial ainda não está configurado no layout da plataforma.');
      return;
    }

    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleEmailCta = async () => {
    if (!validateForm()) return;
    const saved = await submitSponsorInterestLead('email');
    if (!saved) return;

    const subject = encodeURIComponent(`Interesse em patrocínio - ${form.companyName.trim()}`);
    const body = encodeURIComponent(contactMessage);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef4f8_45%,#f8fafc_100%)]">
      <section
        className="relative overflow-hidden border-b border-slate-200/70"
        style={{
          background: `radial-gradient(circle at top left, color-mix(in srgb, ${settings.primaryColor} 24%, transparent) 0%, transparent 42%), linear-gradient(135deg, ${settings.secondaryColor} 0%, #12213e 52%, #10361f 100%)`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-60">
          <div className="absolute -left-24 top-12 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-amber-300/15 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:px-8 lg:py-24 2xl:grid-cols-[1.05fr_0.95fr] 2xl:items-center">
          <div className="max-w-3xl 2xl:max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/8 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200 backdrop-blur">
              <Sparkles className="h-4 w-4" />
              Patrocínio premium no marketplace
            </div>

            <h1 className="mt-6 max-w-4xl text-4xl font-black leading-[0.98] text-white md:text-6xl">
              Coloque sua marca no topo da decisão de compra no agro
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-200 md:text-xl">
              Destaque sua empresa no topo do site, apareça para compradores com alta intenção de compra e gere mais cliques, leads qualificados e oportunidades reais de venda.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleWhatsAppCta();
                }}
                disabled={isSubmittingLead}
                className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-black text-white shadow-[0_24px_40px_-24px_rgba(22,163,74,0.8)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: settings.primaryColor }}
              >
                {isSubmittingLead ? 'Registrando interesse...' : 'Falar no WhatsApp'}
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleEmailCta();
                }}
                disabled={isSubmittingLead}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-6 py-3.5 text-sm font-black text-white backdrop-blur transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingLead ? 'Registrando interesse...' : 'Enviar proposta por e-mail'}
                <Mail className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {statCards.map((item) => (
                <div
                  key={item.label}
                  className="rounded-[1.6rem] border border-white/10 bg-white/6 p-4 shadow-[0_24px_55px_-40px_rgba(15,23,42,0.8)] backdrop-blur"
                >
                  <p className="text-2xl font-black text-white">{item.value}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[32rem] 2xl:max-w-[36rem]">
            <div className="absolute -left-8 top-8 h-24 w-24 rounded-full bg-emerald-300/20 blur-2xl" />
            <div className="absolute bottom-10 right-0 h-28 w-28 rounded-full bg-amber-300/20 blur-2xl" />

            <div className="relative rounded-[2.2rem] border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.14)_0%,rgba(255,255,255,0.06)_100%)] p-5 shadow-[0_45px_90px_-60px_rgba(15,23,42,0.95)] backdrop-blur">
              <div className="overflow-hidden rounded-[1.8rem] border border-white/10 bg-[#f8fbfd] shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-5 py-4 text-white">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-300/90" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/90" />
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-200">Visualização do topo</p>
                      <p className="mt-1 text-sm font-bold text-white/90">Carrossel premium para patrocinadores</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-amber-200/40 bg-amber-300/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
                    Posição premium
                  </span>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-[1.7rem] border border-slate-200 bg-white p-3 shadow-[0_20px_50px_-36px_rgba(15,23,42,0.45)]">
                    <div className="overflow-hidden rounded-[1.35rem] border border-emerald-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.97)_0%,rgba(16,52,29,0.96)_55%,rgba(251,191,36,0.22)_100%)] p-5">
                      <div className="max-w-lg">
                          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">
                            <Crown className="h-3.5 w-3.5" />
                            Patrocinador em destaque
                          </div>
                          <h3 className="mt-4 text-2xl font-black leading-tight text-white">
                            Sua marca no topo da jornada de compra
                          </h3>
                          <p className="mt-3 max-w-md text-sm leading-7 text-slate-200">
                            Destaque sua empresa para compradores prontos para agir e leve o clique direto para o seu site ou WhatsApp comercial.
                          </p>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {['Topo do site', 'Site ou WhatsApp', 'Alta intenção de compra'].map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/12 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      {
                        title: 'Segmento máquinas',
                        color: 'from-slate-900 via-slate-800 to-emerald-900',
                        cta: 'Clique para falar agora',
                      },
                      {
                        title: 'Insumos em destaque',
                        color: 'from-[#1f2937] via-[#0f766e] to-[#f59e0b]',
                        cta: 'Saiba mais sobre a oferta',
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        className={`rounded-[1.2rem] border border-slate-200 bg-gradient-to-br ${item.color} p-4 text-white shadow-[0_16px_30px_-24px_rgba(15,23,42,0.5)]`}
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">Banner do carrossel</p>
                        <p className="mt-3 text-lg font-black leading-tight">{item.title}</p>
                        <div className="mt-4 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90">
                          {item.cta}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { label: 'Impressões', value: '24,8 mil', hint: 'Marca exibida no topo' },
                      { label: 'Cliques', value: '1.420', hint: 'Interesse direto no banner' },
                      { label: 'CTR', value: '5,7%', hint: 'Desempenho da campanha' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="rounded-[1.25rem] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-4 shadow-[0_16px_30px_-24px_rgba(15,23,42,0.3)]"
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{item.label}</p>
                        <p className="mt-2 text-2xl font-black text-slate-950">{item.value}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[1.35rem] border border-slate-200 bg-[linear-gradient(135deg,#f8fafc_0%,#edf7f0_100%)] px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Visibilidade controlada</p>
                        <p className="mt-1 text-sm font-bold text-slate-900">Apenas 6 patrocinadores por vez, com exclusividade por nicho.</p>
                      </div>
                      <span className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                        Menos ruído, mais atenção
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Por que patrocinar</p>
          <h2 className="mt-3 text-3xl font-black text-slate-950 md:text-5xl">
            Mais visibilidade para a sua marca no momento exato da decisão
          </h2>
          <p className="mt-4 text-base leading-8 text-slate-500">
            O patrocínio foi pensado para colocar sua empresa diante de compradores já ativos no marketplace, sem poluir a experiência e sem diluir a atenção da sua marca.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {benefitCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-[1.8rem] border border-slate-200 bg-white p-6 shadow-[0_24px_55px_-44px_rgba(15,23,42,0.45)]"
              >
                <div
                  className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)` }}
                >
                  <Icon className="h-5 w-5" style={{ color: settings.primaryColor }} />
                </div>
                <p className="text-xl font-black text-slate-950">{item.title}</p>
                <p className="mt-3 text-sm leading-7 text-slate-500">{item.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_70px_-52px_rgba(15,23,42,0.4)]">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Benefícios exclusivos</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950">Um espaço valorizado, com menos ruído e mais atenção para sua marca</h2>
            <div className="mt-6 grid gap-4">
              {exclusiveFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                        <Icon className="h-5 w-5" style={{ color: settings.primaryColor }} />
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-950">{feature.title}</p>
                        <p className="mt-2 text-sm leading-7 text-slate-500">{feature.description}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-6">
            <div
              className="overflow-hidden rounded-[2rem] border p-6 shadow-[0_30px_70px_-52px_rgba(15,23,42,0.42)]"
              style={{
                borderColor: `color-mix(in srgb, ${settings.accentColor} 35%, #e2e8f0)`,
                background: `linear-gradient(135deg, color-mix(in srgb, ${settings.accentColor} 15%, white) 0%, color-mix(in srgb, ${settings.primaryColor} 11%, white) 100%)`,
              }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Exclusividade por nicho</p>
                  <h3 className="mt-3 text-3xl font-black text-slate-950">Apenas 6 patrocinadores por vez</h3>
                  <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600">
                    O carrossel comporta no máximo seis empresas, cada uma de um nicho ou categoria diferente. Menos concorrência direta, mais atenção por marca e mais potencial de conversão.
                  </p>
                </div>
                <div className="rounded-[1.5rem] border border-white/60 bg-white/85 px-4 py-3 text-right shadow-sm">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Escassez real</p>
                  <p className="mt-2 text-3xl font-black text-slate-950">6 vagas</p>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {['Menos concorrência direta', 'Mais atenção para o banner', 'Posicionamento premium'].map((item) => (
                  <div key={item} className="rounded-[1.3rem] border border-white/60 bg-white/75 p-4 text-sm font-semibold text-slate-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_70px_-52px_rgba(15,23,42,0.4)]">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Como funciona</p>
              <div className="mt-6 space-y-4">
                {steps.map((step, index) => (
                  <div key={step} className="flex gap-4 rounded-[1.4rem] border border-slate-200 bg-slate-50 p-4">
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl text-sm font-black text-white"
                      style={{ backgroundColor: settings.primaryColor }}
                    >
                      {index + 1}
                    </div>
                    <p className="text-sm leading-7 text-slate-600">{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8">
        <div className="rounded-[2.2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_70px_-52px_rgba(15,23,42,0.42)] md:p-8">
          <div className="max-w-3xl">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Métricas com transparência</p>
            <h2 className="mt-3 text-3xl font-black text-slate-950 md:text-4xl">
              Acompanhe resultados reais para medir o retorno do patrocínio
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-500">
              O patrocinador acompanha os indicadores que importam para avaliar performance, ajustar campanha e entender de onde vem a atenção do público.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div key={metric.title} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm">
                    <Icon className="h-5 w-5" style={{ color: settings.primaryColor }} />
                  </div>
                  <p className="text-base font-black text-slate-950">{metric.title}</p>
                  <p className="mt-2 text-sm leading-7 text-slate-500">{metric.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
          <div
            className="rounded-[2.2rem] border p-7 text-white shadow-[0_40px_90px_-60px_rgba(15,23,42,0.95)]"
            style={{
              borderColor: 'rgba(255,255,255,0.08)',
              background: `linear-gradient(140deg, ${settings.secondaryColor} 0%, #15284a 58%, #10341d 100%)`,
            }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-200">
              <Layers3 className="h-4 w-4" />
              Esteja no topo
            </div>
            <h2 className="mt-6 text-3xl font-black leading-tight">
              Garanta sua posição antes que as vagas acabem
            </h2>
            <p className="mt-4 text-sm leading-8 text-slate-300">
              Estar no topo significa estar à frente da concorrência no momento mais importante: quando o comprador está decidido a agir. Se a sua empresa quer presença forte, esta é uma das vitrines mais valiosas da plataforma.
            </p>

            <div className="mt-8 space-y-3">
              {[
                'Carrossel premium com destaque máximo na home.',
                'Exclusividade por nicho para reduzir concorrência direta.',
                'Canal direto para site ou WhatsApp comercial.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-[1.4rem] border border-white/10 bg-white/6 px-4 py-3">
                  <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                  <p className="text-sm leading-7 text-slate-200">{item}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2.2rem] border border-slate-200 bg-white p-6 shadow-[0_30px_70px_-52px_rgba(15,23,42,0.42)] md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400">Fale com a equipe</p>
                <h2 className="mt-3 text-3xl font-black text-slate-950">Reserve seu espaço de patrocinador</h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
                  Preencha os dados abaixo e escolha o canal de contato. Você pode seguir direto para o WhatsApp comercial ou enviar as informações por e-mail em formato estruturado.
                </p>
              </div>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                Vagas limitadas
              </span>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Empresa</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={(event) => handleFieldChange('companyName', event.target.value)}
                  placeholder="Nome da empresa"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Responsável</label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(event) => handleFieldChange('contactName', event.target.value)}
                  placeholder="Seu nome"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">E-mail</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => handleFieldChange('email', event.target.value)}
                  placeholder="voce@empresa.com"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(event) => handleFieldChange('phone', event.target.value)}
                  placeholder="(00) 00000-0000"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Segmento / nicho</label>
                <input
                  type="text"
                  value={form.segment}
                  onChange={(event) => handleFieldChange('segment', event.target.value)}
                  placeholder="Ex.: Máquinas, insumos, genética, serviços, tecnologia agrícola"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Mensagem</label>
                <textarea
                  value={form.message}
                  onChange={(event) => handleFieldChange('message', event.target.value)}
                  placeholder="Conte um pouco sobre o objetivo da campanha e o canal que você prefere usar."
                  className="min-h-[130px] w-full rounded-2xl border border-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void handleWhatsAppCta();
                }}
                disabled={isSubmittingLead}
                className="inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-black text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                style={{ backgroundColor: settings.primaryColor }}
              >
                {isSubmittingLead ? 'Registrando interesse...' : 'Falar no WhatsApp'}
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleEmailCta();
                }}
                disabled={isSubmittingLead}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingLead ? 'Registrando interesse...' : 'Enviar por e-mail'}
                <Send className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-6 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-500">
              Se preferir navegar antes, você também pode voltar para a plataforma e continuar explorando os nossos produtos e categorias.
              <div className="mt-3">
                <Link to="/" className="font-black text-green-700 hover:text-green-800">
                  Voltar para a página inicial
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SponsorLandingView;
