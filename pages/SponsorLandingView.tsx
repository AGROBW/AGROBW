
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  ChevronDown,
  Crown,
  Eye,
  Layers3,
  MapPin,
  MessageCircle,
  MousePointerClick,
  Quote,
  Send,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { useLayout } from '../src/contexts/LayoutContext';
import { supabase } from '../src/lib/supabaseClient';
import SeoHead from '../components/SeoHead';

const SUPPORT_EMAIL = 'suporte@bwagro.com.br';

const normalizeExternalUrl = (url?: string | null) => {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const buildWhatsAppUrl = (rawValue: string | null | undefined, message: string) => {
  if (!rawValue) return null;

  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  const encodedMessage = encodeURIComponent(message);
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && !/[a-z]/i.test(trimmed)) {
    return `https://wa.me/${digitsOnly}?text=${encodedMessage}`;
  }

  const normalizedUrl = normalizeExternalUrl(trimmed);
  if (!normalizedUrl) return null;

  try {
    const parsed = new URL(normalizedUrl);
    const host = parsed.hostname.toLowerCase();
    const isWhatsAppHost =
      host === 'wa.me' ||
      host.endsWith('.wa.me') ||
      host === 'api.whatsapp.com' ||
      host.endsWith('.whatsapp.com') ||
      host === 'whatsapp.com';

    if (!isWhatsAppHost) {
      return null;
    }

    if (host === 'wa.me' || host.endsWith('.wa.me')) {
      parsed.searchParams.set('text', message);
      return parsed.toString();
    }

    parsed.searchParams.set('text', message);
    if (!parsed.pathname || parsed.pathname === '/') {
      parsed.pathname = '/send';
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const VAGAS_TOTAL = 6;

interface SponsorLandingStats {
  total_slots: number;
  occupied_slots: number;
  available_slots: number;
  active_sponsors: number;
  registered_users: number;
  active_announcements: number;
  active_stores: number;
  generated_leads: number;
}

interface SponsorTestimonial {
  id: string;
  companyName: string;
  contactName: string;
  roleTitle?: string | null;
  segment?: string | null;
  locationLabel?: string | null;
  text: string;
  avatarUrl?: string | null;
  highlightMetric?: string | null;
  isFeatured?: boolean;
}

const defaultSponsorStats: SponsorLandingStats = {
  total_slots: VAGAS_TOTAL,
  occupied_slots: 0,
  available_slots: VAGAS_TOTAL,
  active_sponsors: 0,
  registered_users: 0,
  active_announcements: 0,
  active_stores: 0,
  generated_leads: 0,
};

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    notation: value >= 1000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);

const benefitCards = [
  {
    icon: Eye,
    title: 'Mais presença para sua marca',
    description: 'Destaque sua empresa em espaços de alta visibilidade e fortaleça sua presença dentro da plataforma.',
    stat: 'Visibilidade estratégica',
  },
  {
    icon: MousePointerClick,
    title: 'Conexão com compradores',
    description: 'Aproxime sua marca de usuários que já estão navegando por anúncios e avaliando oportunidades de negócio.',
    stat: 'Conexão qualificada',
  },
  {
    icon: Target,
    title: 'Leads com intenção',
    description: 'Você recebe interesse de quem já está pesquisando soluções dentro do seu nicho de atuação no agronegócio.',
    stat: 'Público com alta intenção',
  },
  {
    icon: TrendingUp,
    title: 'Conversão direta',
    description: 'A jornada encurta ao máximo: o comprador sai do banner direto para seu site ou WhatsApp comercial.',
    stat: 'Zero intermediários',
  },
];

const exclusiveFeatures = [
  {
    icon: Crown,
    title: 'Destaque no topo do site',
    description: 'Carrossel premium de alta visibilidade, posicionando sua marca logo na abertura da plataforma.',
  },
  {
    icon: Users,
    title: 'Público com intenção de compra',
    description: 'Você não compra tráfego vazio. Se posiciona diante de usuários ativamente buscando soluções.',
  },
  {
    icon: MessageCircle,
    title: 'Redirecionamento direto',
    description: 'Leve o usuário para o seu site institucional ou WhatsApp e acelere o início da conversa comercial.',
  },
  {
    icon: BadgeCheck,
    title: 'Exclusividade por nicho',
    description: 'Cada marca da Vitrine Premium ocupa um segmento distinto, reduzindo concorrência direta e aumentando a atenção sobre sua marca.',
  },
];

const metrics = [
  { icon: Eye, title: 'Impressões', description: 'Quantas vezes o banner foi exibido para compradores.' },
  { icon: MousePointerClick, title: 'Cliques', description: 'Interações que demonstram interesse real na sua Vitrine Premium.' },
  { icon: BarChart3, title: 'CTR', description: 'Taxa de cliques para medir a eficiência do criativo.' },
  { icon: MessageCircle, title: 'Contatos no WhatsApp', description: 'Quantidade de redirecionamentos iniciados diretamente.' },
  { icon: MapPin, title: 'Região principal', description: 'Localização dominante do público com maior interesse.' },
];

const steps = [
  { label: 'Reserva', text: 'Sua empresa reserva um dos espaços disponíveis via formulário ou WhatsApp.' },
  { label: 'Publicação', text: 'Seu banner entra no carrossel premium do topo da plataforma em até 48h.' },
  { label: 'Engajamento', text: 'Compradores visualizam, clicam e chegam direto ao seu canal de contato.' },
  { label: 'Resultados', text: 'Você acompanha métricas reais e converte o interesse em oportunidades.' },
];

const fallbackTestimonials: SponsorTestimonial[] = [
  {
    id: 'fallback-carlos',
    companyName: 'Agro Maquinas Sul',
    contactName: 'Carlos Mendonca',
    roleTitle: 'Diretor Comercial',
    segment: 'Máquinas agrícolas',
    locationLabel: 'Rio Verde/GO',
    avatarUrl: 'https://i.pravatar.cc/80?u=carlos_agro',
    text: 'Em 30 dias na Vitrine Premium, recebemos mais de 40 contatos qualificados direto pelo WhatsApp. O ROI superou qualquer outra mídia digital que testamos no setor.',
    highlightMetric: '+40 contatos qualificados em 30 dias',
    isFeatured: true,
  },
  {
    id: 'fallback-fernanda',
    companyName: 'InsumosPro',
    contactName: 'Fernanda Oliveira',
    roleTitle: 'Gerente de Marketing',
    segment: 'Insumos',
    locationLabel: 'Uberlândia/MG',
    avatarUrl: 'https://i.pravatar.cc/80?u=fernanda_insumos',
    text: 'A exclusividade por nicho fez toda a diferença. Nosso banner não compete com concorrente direto, e isso se reflete no CTR muito acima da mídia que tínhamos em outras plataformas.',
    highlightMetric: 'CTR acima das campanhas anteriores',
  },
  {
    id: 'fallback-roberto',
    companyName: 'AgroTech Soluções',
    contactName: 'Roberto Faria',
    roleTitle: 'CEO',
    segment: 'Tecnologia para o agro',
    locationLabel: 'Cuiabá/MT',
    avatarUrl: 'https://i.pravatar.cc/80?u=roberto_agrotech',
    text: 'Estamos no segundo ciclo da Vitrine Premium. A visibilidade no topo do marketplace trouxe leads que já se tornaram clientes recorrentes. Vale muito o investimento.',
    highlightMetric: 'Leads que viraram clientes recorrentes',
  },
];

const faqs = [
  {
    question: 'Como funciona o processo de aprovação do banner?',
    answer: 'Após a reserva, você envia o material criativo (imagem + link de destino). Nossa equipe revisa em até 24h para garantir qualidade e adequação. Após aprovação, o banner vai ao ar em até 48h.',
  },
  {
    question: 'Quem cria o banner? Preciso ter um designer?',
    answer: 'Você pode enviar seu próprio material. Se precisar de apoio, nossa equipe pode indicar parceiros de criação. O formato solicitado é simples: imagem JPG/PNG em alta resolução + URL de destino.',
  },
  {
    question: 'Qual é o prazo mínimo da Vitrine Premium?',
    answer: 'O contrato mínimo é de 30 dias. Após o período inicial, você pode renovar mensalmente com prioridade sobre novos interessados no mesmo nicho.',
  },
  {
    question: 'Como acompanho as métricas da campanha?',
    answer: 'Você recebe um relatório mensal por e-mail com impressões, cliques, CTR e origens do público. Em breve teremos um painel de acesso em tempo real.',
  },
  {
    question: 'O que acontece se meu nicho já estiver ocupado?',
    answer: 'Você entra em uma lista de espera prioritária. Quando a vaga do seu segmento ficar disponível, você será o primeiro notificado com prazo de 48h para confirmar.',
  },
  {
    question: 'Posso redirecionar para WhatsApp e site ao mesmo tempo?',
    answer: 'Cada banner possui um único destino de clique. Recomendamos priorizar o canal que sua equipe responde mais rápido. Normalmente o WhatsApp gera respostas mais ágeis e maiores taxas de conversão.',
  },
];

const AGRO_FALLBACK_IMAGES = {
  hero: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?q=80&w=1600&auto=format&fit=crop',
  field: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1200&auto=format&fit=crop',
  harvest: 'https://images.unsplash.com/photo-1574943320219-553eb213f72d?q=80&w=900&auto=format&fit=crop',
};

// --- FAQ Item ----------------------------------------------------------------
const FaqItem: React.FC<{ question: string; answer: string }> = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-base font-bold text-slate-900">{question}</span>
        <ChevronDown
          className={`h-5 w-5 flex-shrink-0 text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${open ? 'max-h-48 pb-5' : 'max-h-0'}`}
      >
        <p className="text-sm leading-7 text-slate-500">{answer}</p>
      </div>
    </div>
  );
};


const SponsorLandingView: React.FC = () => {
  const { settings } = useLayout();
  const agro_images = {
    hero: settings.sponsorHeroImageUrl || AGRO_FALLBACK_IMAGES.hero,
    field: settings.sponsorFieldImageUrl || AGRO_FALLBACK_IMAGES.field,
    harvest: settings.sponsorHarvestImageUrl || AGRO_FALLBACK_IMAGES.harvest,
    finalCta: settings.sponsorFinalCtaImageUrl || settings.sponsorFieldImageUrl || AGRO_FALLBACK_IMAGES.field,
  };
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  const [formSent, setFormSent] = useState(false);
  const [sponsorStats, setSponsorStats] = useState<SponsorLandingStats>(defaultSponsorStats);
  const [sponsorTestimonials, setSponsorTestimonials] = useState<SponsorTestimonial[]>(fallbackTestimonials);
  const [form, setForm] = useState({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    segment: '',
    message: '',
  });

  const whatsappDestination = settings.commercialWhatsappNumber || settings.whatsappUrl;
  const brandName = settings.siteName || 'AGRO BW';
  const totalSponsorSlots = sponsorStats.total_slots || VAGAS_TOTAL;
  const occupiedSponsorSlots = Math.min(sponsorStats.occupied_slots || 0, totalSponsorSlots);
  const vagasRestantes = Math.max(sponsorStats.available_slots ?? totalSponsorSlots - occupiedSponsorSlots, 0);
  const featuredTestimonial = useMemo(
    () => sponsorTestimonials.find((item) => item.isFeatured) || sponsorTestimonials[0] || null,
    [sponsorTestimonials],
  );
  const secondaryTestimonials = useMemo(
    () =>
      sponsorTestimonials.filter((item) => item.id !== featuredTestimonial?.id).slice(0, 4),
    [featuredTestimonial?.id, sponsorTestimonials],
  );

  const contactMessage = useMemo(() => {
    return [
      `Olá, equipe ${brandName}.`,
      'Tenho interesse em reservar um espaço na Vitrine Premium.',
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

  useEffect(() => {
    let isMounted = true;

    const loadSponsorStats = async () => {
      const { data, error } = await supabase.rpc('get_public_sponsor_landing_stats');

      if (error) {
        console.error('[SponsorLandingView] Erro ao carregar dados reais de patrocinador:', error);
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (isMounted && row) {
        setSponsorStats({
          total_slots: Number(row.total_slots ?? VAGAS_TOTAL),
          occupied_slots: Number(row.occupied_slots ?? 0),
          available_slots: Number(row.available_slots ?? VAGAS_TOTAL),
          active_sponsors: Number(row.active_sponsors ?? 0),
          registered_users: Number(row.registered_users ?? 0),
          active_announcements: Number(row.active_announcements ?? 0),
          active_stores: Number(row.active_stores ?? 0),
          generated_leads: Number(row.generated_leads ?? 0),
        });
      }
    };

    const loadTestimonials = async () => {
      const { data, error } = await supabase
        .from('sponsor_testimonials')
        .select(
          'id, company_name, contact_name, role_title, segment, location_label, testimonial, avatar_url, highlight_metric, is_featured',
        )
        .eq('status', 'published')
        .order('is_featured', { ascending: false })
        .order('display_order', { ascending: true })
        .limit(6);

      if (error) {
        console.error('[SponsorLandingView] Erro ao carregar relatos da Vitrine Premium:', error);
        return;
      }

      if (!isMounted || !data || data.length === 0) {
        return;
      }

      setSponsorTestimonials(
        data.map((row) => ({
          id: row.id,
          companyName: row.company_name,
          contactName: row.contact_name,
          roleTitle: row.role_title,
          segment: row.segment,
          locationLabel: row.location_label,
          text: row.testimonial,
          avatarUrl: row.avatar_url,
          highlightMetric: row.highlight_metric,
          isFeatured: row.is_featured,
        })),
      );
    };

    void loadSponsorStats();
    void loadTestimonials();

    return () => {
      isMounted = false;
    };
  }, []);

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
    setFormSent(true);
    const link = buildWhatsAppUrl(whatsappDestination, contactMessage);
    if (!link) {
      toast.error('O WhatsApp comercial do layout está vazio ou inválido. Configure um telefone, link wa.me ou api.whatsapp.com.');
      return;
    }
    window.open(link, '_blank', 'noopener,noreferrer');
  };

  const handleEmailCta = async () => {
    if (!validateForm()) return;
    const saved = await submitSponsorInterestLead('email');
    if (!saved) return;
    setFormSent(true);
    const subject = encodeURIComponent(`Interesse em Vitrine Premium - ${form.companyName.trim()}`);
    const body = encodeURIComponent(contactMessage);
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-white">
      <SeoHead
        title="Vitrine Premium para marcas do agronegócio"
        description="Leve sua marca para a Vitrine Premium da AGRO BW e ganhe visibilidade estratégica dentro do marketplace rural."
        canonicalPath="/vitrine"
      />

      {/* -- HERO ------------------------------------------------------------ */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* background image */}
        <div
          className="absolute inset-0 bg-cover bg-center scale-105"
          style={{ backgroundImage: `url(${agro_images.hero})` }}
        />
        {/* overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-900/80 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />

        {/* decorative blobs */}
        <div className="pointer-events-none absolute top-20 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-1/4 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" />

        <div className="relative mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-24 lg:py-32">
          <div className="max-w-3xl">
            {/* badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300 backdrop-blur mb-6">
              <Sparkles className="h-3.5 w-3.5" />
              Vitrine Premium - Marketplace agro
            </div>

            <h1 className="text-5xl md:text-7xl font-black leading-[0.95] text-white mb-6">
              Coloque sua marca{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-amber-300">
                no topo
              </span>{' '}
              da decisão de compra no agro
            </h1>

            <p className="text-lg md:text-xl text-slate-300 leading-8 max-w-2xl mb-10">
              Destaque sua empresa no carrossel premium do maior marketplace agro da região. Apareça para compradores com alta intenção de compra e gere leads qualificados diretamente para seu canal de vendas.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-4 mb-14">
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('reservar');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[0_20px_40px_-20px_rgba(22,163,74,0.7)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_50px_-20px_rgba(22,163,74,0.9)] active:scale-95"
                style={{ backgroundColor: settings.primaryColor }}
              >
                Reservar minha vaga agora
                <ArrowRight className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const el = document.getElementById('como-funciona');
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/8 px-8 py-4 text-base font-black text-white backdrop-blur transition-colors hover:bg-white/15"
              >
                Ver como funciona
              </button>
            </div>

            {/* stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
              {[
                { value: `${vagasRestantes} vagas`, label: 'Disponíveis agora' },
                { value: 'Lead direto', label: 'Site ou WhatsApp' },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl border border-white/10 bg-white/8 p-4 backdrop-blur"
                >
                  <p className="text-2xl font-black text-white">{s.value}</p>
                  <p className="mt-1 text-xs text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* -- BARRA DE CONFIANÇA ---------------------------------------------- */}
      <section className="border-y border-slate-100 bg-slate-50 py-5">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14">
            {[
              { icon: BadgeCheck, label: 'Plataforma verificada' },
              { icon: Users, label: `${formatCompactNumber(sponsorStats.registered_users)} usuários cadastrados` },
              { icon: Layers3, label: `${formatCompactNumber(sponsorStats.active_stores)} lojas ativas` },
              { icon: Target, label: `${formatCompactNumber(sponsorStats.generated_leads)} leads gerados` },
              { icon: Zap, label: 'Banner publicado em 48h' },
              { icon: Crown, label: 'Exclusividade por nicho' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Icon className="h-4 w-4" style={{ color: settings.primaryColor }} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* -- VAGAS DISPONÍVEIS ----------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div
          className="rounded-[2rem] p-8 md:p-12 flex flex-col md:flex-row items-center gap-8"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 8%, white) 0%, color-mix(in srgb, ${settings.accentColor} 6%, white) 100%)`,
            border: `1.5px solid color-mix(in srgb, ${settings.primaryColor} 20%, #e2e8f0)`,
          }}
        >
          <div className="flex-1">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-3">Disponibilidade em tempo real</p>
            <h2 className="text-3xl md:text-4xl font-black text-slate-950 mb-4">
              {vagasRestantes} de {totalSponsorSlots} vagas disponíveis
            </h2>
            <p className="text-slate-500 text-sm leading-7 max-w-xl">
              O carrossel comporta apenas {totalSponsorSlots} marcas simultâneas na Vitrine Premium, cada uma de um nicho diferente. Exclusividade real para a sua marca.
            </p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-center gap-4">
            <div className="flex gap-3">
              {Array.from({ length: totalSponsorSlots }).map((_, i) => (
                <div
                  key={i}
                  className={`h-10 w-10 rounded-full border-2 flex items-center justify-center text-xs font-black transition-all ${
                    i < occupiedSponsorSlots
                      ? 'border-slate-300 bg-slate-200 text-slate-400'
                      : 'border-emerald-400 bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]'
                  }`}
                >
                  {i < occupiedSponsorSlots ? 'OK' : i + 1}
                </div>
              ))}
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />Ocupada</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500 inline-block" />Disponível</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('reservar');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="rounded-2xl px-6 py-3 text-sm font-black text-white transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Garantir minha vaga
            </button>
          </div>
        </div>
      </section>

      {/* -- BENEFÍCIOS ------------------------------------------------------ */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-16">
        <div className="text-center mb-12">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-3">Por que patrocinar</p>
          <h2 className="text-3xl md:text-5xl font-black text-slate-950 max-w-3xl mx-auto">
            Visibilidade no momento exato em que o comprador está pronto para agir
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {benefitCards.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group rounded-[1.8rem] border border-slate-200 bg-white p-7 shadow-[0_8px_30px_-10px_rgba(15,23,42,0.12)] hover:shadow-[0_16px_40px_-10px_rgba(15,23,42,0.18)] hover:-translate-y-1 transition-all duration-300"
              >
                <div
                  className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl transition-transform group-hover:scale-110"
                  style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)` }}
                >
                  <Icon className="h-5 w-5" style={{ color: settings.primaryColor }} />
                </div>
                <p className="text-xl font-black text-slate-950 mb-3">{item.title}</p>
                <p className="text-sm leading-7 text-slate-500 mb-5">{item.description}</p>
                <div
                  className="inline-block rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em]"
                  style={{
                    background: `color-mix(in srgb, ${settings.primaryColor} 10%, white)`,
                    color: settings.primaryColor,
                  }}
                >
                  {item.stat}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* -- COMO FUNCIONA --------------------------------------------------- */}
      <section id="como-funciona" className="bg-slate-950 py-24 relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 left-1/3 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-80 w-80 rounded-full bg-amber-400/8 blur-3xl" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-16">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-400 mb-3">Processo simples</p>
            <h2 className="text-3xl md:text-5xl font-black text-white">Da reserva aos primeiros leads em 4 passos</h2>
          </div>
          <div className="grid gap-0 md:grid-cols-4">
            {steps.map((step, i) => (
              <div key={step.label} className="relative flex flex-col items-center text-center p-8">
                {/* connector */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-[3.75rem] left-1/2 w-full h-[2px] bg-gradient-to-r from-emerald-500/50 to-transparent" />
                )}
                <div
                  className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center text-lg font-black text-white mb-6 shadow-[0_4px_20px_-4px_rgba(16,185,129,0.5)]"
                  style={{ backgroundColor: settings.primaryColor }}
                >
                  {i + 1}
                </div>
                <p className="text-sm font-black uppercase tracking-widest text-emerald-400 mb-3">{step.label}</p>
                <p className="text-sm leading-7 text-slate-400">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('reservar');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white transition-all hover:-translate-y-1"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Quero começar agora
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </section>

      {/* -- DIFERENCIAIS + IMAGEM ------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid gap-16 lg:grid-cols-2 items-center">
          {/* image */}
          <div className="relative order-2 lg:order-1">
            <div className="absolute -inset-4 rounded-[3rem] bg-emerald-50 -rotate-2" />
            <img
              src={agro_images.harvest}
              alt="Agronegócio em ação"
              className="relative z-10 w-full h-[500px] object-cover rounded-[2.5rem] shadow-2xl"
            />
          </div>

          {/* content */}
          <div className="order-1 lg:order-2">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-4">Benefícios exclusivos</p>
            <h2 className="text-3xl md:text-5xl font-black text-slate-950 mb-6 leading-tight">
              Menos ruído,{' '}
              <span className="text-transparent bg-clip-text" style={{ backgroundImage: `linear-gradient(120deg, ${settings.primaryColor}, #a3e635)` }}>
                mais atenção
              </span>{' '}
              para a sua marca
            </h2>
            <p className="text-base leading-8 text-slate-500 mb-10">
              Um espaço valorizado com exclusividade por segmento. Sua campanha não compete com concorrente direto; cada uma das {totalSponsorSlots} vagas representa um nicho diferente do agronegócio.
            </p>
            <div className="space-y-4">
              {exclusiveFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-5">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                      <Icon className="h-5 w-5" style={{ color: settings.primaryColor }} />
                    </div>
                    <div>
                      <p className="font-black text-slate-950">{feature.title}</p>
                      <p className="text-sm leading-7 text-slate-500 mt-1">{feature.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* -- MÉTRICAS -------------------------------------------------------- */}
      <section className="bg-slate-50 py-20 border-y border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-3">Transparência total</p>
            <h2 className="text-3xl md:text-4xl font-black text-slate-950">
              Acompanhe resultados reais semanalmente
            </h2>
            <p className="mt-4 text-base leading-8 text-slate-500">
              Você recebe um relatório com os indicadores que importam para medir o retorno da Vitrine Premium e ajustar a estratégia.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.title}
                  className="rounded-[1.6rem] border border-slate-200 bg-white p-6 shadow-[0_4px_20px_-8px_rgba(15,23,42,0.12)]"
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-50">
                    <Icon className="h-5 w-5" style={{ color: settings.primaryColor }} />
                  </div>
                  <p className="text-base font-black text-slate-950">{metric.title}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{metric.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* -- DEPOIMENTOS ----------------------------------------------------- */}
      <section className="bg-[#070d1d] py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-3">
              Quem já anunciou na vitrine
            </p>
            <h2 className="text-3xl md:text-5xl font-black text-white">O que dizem nossos anunciantes</h2>
          </div>
          {featuredTestimonial ? (
            <div className="grid gap-8 lg:grid-cols-[0.92fr_1.12fr_0.92fr] lg:items-stretch">
              {secondaryTestimonials.slice(0, 1).map((t) => (
                <article
                  key={t.id}
                  className="group flex h-full flex-col rounded-[2rem] border border-white/8 bg-[#121a2f] p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.65)] transition-all duration-300 hover:-translate-y-1 hover:border-white/14"
                >
                  <div className="mb-6 flex items-start justify-between gap-4">
                    <div className="flex gap-1.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <Quote className="h-9 w-9 text-slate-700" />
                  </div>

                  <p className="flex-1 text-[1.05rem] italic leading-9 text-slate-200/92">"{t.text}"</p>

                  <div className="mt-8 border-t border-white/8 pt-8">
                    <div className="flex items-center gap-4">
                      <img
                        src={t.avatarUrl || 'https://i.pravatar.cc/80?u=bwagro-sponsor-testimonial'}
                        alt={t.contactName}
                        className="h-12 w-12 rounded-full border-2 border-slate-600 object-cover"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-lg font-black text-white">{t.contactName}</p>
                        <p className="truncate text-sm text-slate-400">
                          {[t.roleTitle, t.companyName].filter(Boolean).join(', ')}
                        </p>
                      </div>
                    </div>
                  </div>
                </article>
              ))}

              <article
                className="relative flex h-full flex-col rounded-[2.25rem] border border-indigo-400/75 bg-[radial-gradient(circle_at_top,_rgba(76,92,255,0.22),_rgba(25,31,58,0.96)_40%,_rgba(14,18,36,1)_100%)] p-10 shadow-[0_30px_70px_-28px_rgba(76,92,255,0.55)]"
                style={{
                  boxShadow: `0 30px 70px -28px color-mix(in srgb, ${settings.primaryColor} 45%, rgba(76,92,255,0.55))`,
                }}
              >
                <div className="mb-8 flex items-start justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex gap-1.5">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star key={index} className="h-5 w-5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <div className="rounded-full border border-indigo-300/18 bg-indigo-400/12 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-100">
                      Destaque
                    </div>
                  </div>
                  <Quote className="h-12 w-12 text-indigo-300/45" />
                </div>

                <p className="text-[1.08rem] font-semibold leading-[2.15rem] text-white/96 md:text-[1.16rem]">
                  "{featuredTestimonial.text}"
                </p>

                <div className="mt-7 space-y-3">
                  {featuredTestimonial.highlightMetric ? (
                    <div className="inline-flex w-fit rounded-full border border-emerald-400/15 bg-emerald-400/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
                      {featuredTestimonial.highlightMetric}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {featuredTestimonial.segment ? (
                      <div className="inline-flex w-fit rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-100/90">
                        {featuredTestimonial.segment}
                      </div>
                    ) : null}
                    {featuredTestimonial.locationLabel ? (
                      <div className="inline-flex w-fit rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-indigo-100/90">
                        {featuredTestimonial.locationLabel}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-auto border-t border-white/8 pt-8">
                  <div className="flex items-center gap-4">
                    <img
                      src={featuredTestimonial.avatarUrl || 'https://i.pravatar.cc/80?u=bwagro-sponsor-testimonial'}
                      alt={featuredTestimonial.contactName}
                      className="h-14 w-14 rounded-full border-2 border-indigo-300/55 object-cover"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-[1.35rem] font-black text-white">{featuredTestimonial.contactName}</p>
                      <p className="truncate text-sm text-indigo-100/72">
                        {[featuredTestimonial.roleTitle, featuredTestimonial.companyName].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                </div>
              </article>

              <div className="grid gap-8">
                {secondaryTestimonials.slice(1, 3).map((t) => (
                  <article
                    key={t.id}
                    className="group flex h-full flex-col rounded-[2rem] border border-white/8 bg-[#121a2f] p-8 shadow-[0_20px_50px_-30px_rgba(0,0,0,0.65)] transition-all duration-300 hover:-translate-y-1 hover:border-white/14"
                  >
                    <div className="mb-6 flex items-start justify-between gap-4">
                      <div className="flex gap-1.5">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Star key={index} className="h-4 w-4 fill-amber-400 text-amber-400" />
                        ))}
                      </div>
                      <Quote className="h-9 w-9 text-slate-700" />
                    </div>

                    <p className="flex-1 text-[1.05rem] italic leading-9 text-slate-200/92">"{t.text}"</p>

                    <div className="mt-6 space-y-3">
                      {t.highlightMetric ? (
                        <div className="inline-flex w-fit rounded-full border border-emerald-400/12 bg-emerald-400/8 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">
                          {t.highlightMetric}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {t.segment ? (
                          <div className="inline-flex rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                            {t.segment}
                          </div>
                        ) : null}
                        {t.locationLabel ? (
                          <div className="inline-flex rounded-full border border-white/8 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-300">
                            {t.locationLabel}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-8 border-t border-white/8 pt-8">
                      <div className="flex items-center gap-4">
                        <img
                          src={t.avatarUrl || 'https://i.pravatar.cc/80?u=bwagro-sponsor-testimonial'}
                          alt={t.contactName}
                          className="h-12 w-12 rounded-full border-2 border-slate-600 object-cover"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-lg font-black text-white">{t.contactName}</p>
                          <p className="truncate text-sm text-slate-400">
                            {[t.roleTitle, t.companyName].filter(Boolean).join(', ')}
                          </p>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* -- FAQ ------------------------------------------------------------- */}
      <section className="bg-slate-50 border-y border-slate-200 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-3">Dúvidas frequentes</p>
            <h2 className="text-3xl md:text-4xl font-black text-slate-950">Perguntas sobre a Vitrine Premium</h2>
          </div>
          <div className="rounded-[2rem] border border-slate-200 bg-white px-8 shadow-[0_8px_30px_-10px_rgba(15,23,42,0.1)]">
            {faqs.map((faq) => (
              <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

      {/* -- FORMULÁRIO DE RESERVA ------------------------------------------- */}
      <section id="reservar" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-24">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">

          {/* left - pitch */}
          <div
            className="rounded-[2.2rem] p-9 text-white relative overflow-hidden"
            style={{
              background: `linear-gradient(140deg, ${settings.secondaryColor} 0%, #15284a 55%, #10341d 100%)`,
            }}
          >
            <div className="pointer-events-none absolute -top-20 -right-20 h-64 w-64 rounded-full bg-white/5 blur-2xl" />
            <div className="pointer-events-none absolute bottom-0 left-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-2xl" />
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300 mb-8">
                <Layers3 className="h-4 w-4" />
                Espaço limitado
              </div>
              <h2 className="text-3xl font-black leading-tight mb-5">
                Garanta sua posição antes que as vagas se esgotem
              </h2>
              <p className="text-sm leading-8 text-slate-300 mb-10">
                Com apenas {vagasRestantes} vagas disponíveis, estar no topo significa estar à frente da concorrência no momento mais importante: quando o comprador está pronto para agir.
              </p>

              {/* vaga indicator */}
              <div className="rounded-2xl border border-white/10 bg-white/8 p-5 mb-8">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400 mb-4">Vagas disponíveis</p>
                <div className="flex gap-2.5 mb-3">
                  {Array.from({ length: totalSponsorSlots }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-black ${
                        i < occupiedSponsorSlots
                          ? 'bg-slate-600 text-slate-400'
                          : 'bg-emerald-500 text-white shadow-[0_4px_12px_-4px_rgba(16,185,129,0.5)]'
                      }`}
                    >
                      {i < occupiedSponsorSlots ? 'OK' : i + 1}
                    </div>
                  ))}
                </div>
                <p className="text-emerald-300 text-sm font-bold">{vagasRestantes} vagas de {totalSponsorSlots} disponíveis</p>
              </div>

              {/* checkpoints */}
              <div className="space-y-3">
                {[
                  'Carrossel premium com destaque máximo na home.',
                  'Exclusividade por nicho, sem concorrente direto.',
                  'Lead direto para site ou WhatsApp comercial.',
                  'Relatório de métricas enviado toda semana.',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3 text-sm text-slate-200">
                    <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                    {item}
                  </div>
                ))}
              </div>

              {/* photo strip */}
              <div className="mt-10 overflow-hidden rounded-2xl h-36">
                <img
                  src={agro_images.field}
                  alt="Campo de soja"
                  className="w-full h-full object-cover opacity-60"
                />
              </div>
            </div>
          </div>

          {/* right - form */}
          <div className="rounded-[2.2rem] border border-slate-200 bg-white p-8 md:p-10 shadow-[0_16px_50px_-24px_rgba(15,23,42,0.3)]">
            {formSent ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-6">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)` }}
                >
                  <BadgeCheck className="h-10 w-10" style={{ color: settings.primaryColor }} />
                </div>
                <h3 className="text-2xl font-black text-slate-950">Interesse registrado com sucesso!</h3>
                <p className="text-slate-500 text-sm leading-7 max-w-sm">
                  Nossa equipe vai entrar em contato em breve. Se preferiu WhatsApp, a janela de conversa foi aberta.
                </p>
                <Link
                  to="/"
                  className="rounded-2xl border border-slate-200 px-6 py-3 text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Voltar para a plataforma
                </Link>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-400 mb-2">Fale com a equipe</p>
                    <h2 className="text-3xl font-black text-slate-950">Reserve seu espaço</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-500 max-w-md">
                      Preencha os dados e escolha como prefere ser contactado: WhatsApp para resposta imediata, ou e-mail para proposta formal.
                    </p>
                  </div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700 flex-shrink-0">
                    {vagasRestantes} vagas disponíveis
                  </span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Empresa *</label>
                    <input
                      type="text"
                      value={form.companyName}
                      onChange={(e) => handleFieldChange('companyName', e.target.value)}
                      placeholder="Nome da empresa"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm focus:bg-white focus:outline-none focus:ring-2 transition-colors"
                      style={{ '--tw-ring-color': settings.primaryColor } as React.CSSProperties}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Responsável *</label>
                    <input
                      type="text"
                      value={form.contactName}
                      onChange={(e) => handleFieldChange('contactName', e.target.value)}
                      placeholder="Seu nome"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm focus:bg-white focus:outline-none focus:ring-2 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">E-mail *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => handleFieldChange('email', e.target.value)}
                      placeholder="voce@empresa.com"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm focus:bg-white focus:outline-none focus:ring-2 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">WhatsApp / Telefone</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => handleFieldChange('phone', e.target.value)}
                      placeholder="(00) 00000-0000"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm focus:bg-white focus:outline-none focus:ring-2 transition-colors"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Segmento / Nicho *</label>
                    <input
                      type="text"
                      value={form.segment}
                      onChange={(e) => handleFieldChange('segment', e.target.value)}
                      placeholder="Ex.: Máquinas, insumos, genética, serviços, tecnologia agrícola"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm focus:bg-white focus:outline-none focus:ring-2 transition-colors"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-slate-500">Mensagem (opcional)</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => handleFieldChange('message', e.target.value)}
                      placeholder="Conta um pouco sobre o objetivo da campanha ou qualquer dúvida que tiver."
                      className="min-h-[120px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm focus:bg-white focus:outline-none focus:ring-2 transition-colors"
                    />
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => { void handleWhatsAppCta(); }}
                    disabled={isSubmittingLead}
                    className="inline-flex items-center gap-2 rounded-2xl px-6 py-4 text-sm font-black text-white transition-all hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_12px_30px_-12px_rgba(22,163,74,0.6)]"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    {isSubmittingLead ? 'Registrando...' : 'Falar no WhatsApp'}
                    <MessageCircle className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { void handleEmailCta(); }}
                    disabled={isSubmittingLead}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-4 text-sm font-black text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmittingLead ? 'Registrando...' : 'Enviar por e-mail'}
                    <Send className="h-4 w-4" />
                  </button>
                </div>

                <p className="mt-5 text-xs text-slate-400">
                  Ao enviar, você concorda em receber retorno da equipe {brandName} sobre disponibilidade da Vitrine Premium.{' '}
                  <Link to="/" className="font-semibold text-slate-600 hover:text-slate-800">Voltar para a plataforma</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* -- CTA FINAL ------------------------------------------------------- */}
      <section
        className="relative overflow-hidden py-24"
        style={{
          background: `linear-gradient(135deg, ${settings.secondaryColor} 0%, #12213e 50%, #10361f 100%)`,
        }}
      >
        <div className="pointer-events-none absolute top-0 right-0 h-full w-1/2">
          <img
            src={agro_images.finalCta}
            alt=""
            className="w-full h-full object-cover opacity-15"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 to-transparent" />
        </div>
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-400 mb-5">Última chamada</p>
          <h2 className="text-4xl md:text-6xl font-black text-white mb-6 leading-tight">
            {vagasRestantes} vagas. Sua marca pode ocupar uma delas.
          </h2>
          <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-10 leading-8">
            Cada vaga representa um nicho exclusivo. Quando esgotarem, o próximo interessado do mesmo segmento vai para a lista de espera.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('reservar');
                el?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl px-10 py-5 text-lg font-black text-white shadow-[0_24px_50px_-20px_rgba(22,163,74,0.8)] transition-all hover:-translate-y-1 active:scale-95"
              style={{ backgroundColor: settings.primaryColor }}
            >
              Reservar minha vaga
              <ArrowRight className="h-5 w-5" />
            </button>
            <Link
              to="/anuncios"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/8 px-10 py-5 text-lg font-black text-white backdrop-blur transition-colors hover:bg-white/15"
            >
              Explorar a plataforma
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
};

export default SponsorLandingView;



