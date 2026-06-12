import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Target, Telescope, Gem, Loader2, CheckCircle2 } from 'lucide-react';
import { useAboutPage, ABOUT_PAGE_FALLBACK } from '../src/hooks/useAboutPage';
import { supabase } from '../src/lib/supabaseClient';

// Renderiza o texto de "Valores" como lista: um valor por linha no admin.
// Cada linha no formato "Rótulo: descrição" exibe o rótulo em destaque.
// Fallback seguro: se o texto vier em uma única linha, mantém parágrafo normal.
const renderValuesContent = (text?: string) => {
  const lines = (text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return <p className="text-slate-500 leading-relaxed text-left">{text}</p>;
  }

  return (
    <ul className="space-y-3 text-left">
      {lines.map((line, i) => {
        const idx = line.indexOf(':');
        const hasLabel = idx > 0 && idx <= 60;
        const label = hasLabel ? line.slice(0, idx).trim() : '';
        const desc = hasLabel ? line.slice(idx + 1).trim() : line;
        return (
          <li key={i} className="flex gap-2 text-slate-500 leading-relaxed">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" strokeWidth={2} />
            <span>
              {hasLabel && <strong className="font-bold text-slate-900">{label}</strong>}
              {hasLabel ? ' — ' : ''}
              {desc}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

interface AboutStats {
  activeUsers: number | null;
  createdAds: number | null;
  generatedDeals: number | null;
}

interface PublicAboutStatsRow {
  active_users: number;
  created_ads: number;
  generated_deals: number;
}

// Cores de fundo para o fallback de iniciais (quando o produtor não tem foto).
const TRUST_AVATAR_COLORS = ['#15803d', '#b45309', '#1d4ed8', '#7c3aed', '#0f766e'];

const getInitials = (name?: string) =>
  (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

const AboutView: React.FC = () => {
  const { content, isLoading } = useAboutPage();
  const [scrolled, setScrolled] = useState(false);
  const [realStats, setRealStats] = useState<AboutStats>({
    activeUsers: null,
    createdAds: null,
    generatedDeals: null,
  });
  const [trustUsers, setTrustUsers] = useState<{ name: string; avatar: string | null }[]>([]);
  const [failedAvatars, setFailedAvatars] = useState<Record<number, boolean>>({});

  const data = content || ABOUT_PAGE_FALLBACK;

  const formatCompactStat = (value: number | null, fallback: string) => {
    if (value === null) return fallback;

    if (value >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(1).replace('.0', '')} Bi`;
    }

    if (value >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(1).replace('.0', '')} Mi`;
    }

    if (value >= 1_000) {
      return `${(value / 1_000).toFixed(1).replace('.0', '')}k+`;
    }

    return value.toLocaleString('pt-BR');
  };

  const formatTrustLine = (value: number | null) => {
    if (value === null) return '+10.000 produtores confiando.';
    return `+${value.toLocaleString('pt-BR')} produtores confiando.`;
  };

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 100) setScrolled(true);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadRealStats = async () => {
      const { data: stats, error } = await supabase
        .rpc('get_public_about_stats')
        .single<PublicAboutStatsRow>();

      if (error) {
        console.error('[AboutView] Erro ao carregar métricas reais:', error);
        return;
      }

      if (!isMounted || !stats) return;

      setRealStats({
        activeUsers: stats.active_users ?? null,
        createdAds: stats.created_ads ?? null,
        generatedDeals: stats.generated_deals ?? null,
      });
    };

    // Avatares de prova social: produtores reais (view pública vendedores_publicos),
    // verificados primeiro e priorizando quem tem foto; fallback de iniciais.
    const loadTrustUsers = async () => {
      const { data: rows, error } = await supabase
        .from('vendedores_publicos')
        .select('name, avatar, document_verified')
        .order('document_verified', { ascending: false })
        .limit(12);

      if (error || !isMounted || !rows) return;

      const withPhoto = rows.filter((r: any) => r.avatar && String(r.avatar).trim());
      const withoutPhoto = rows.filter((r: any) => !r.avatar || !String(r.avatar).trim());
      const ordered = [...withPhoto, ...withoutPhoto].slice(0, 4);

      setTrustUsers(
        ordered.map((r: any) => ({ name: r.name || 'Produtor', avatar: r.avatar || null })),
      );
    };

    loadRealStats();
    loadTrustUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-12 h-12 text-green-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <section className="relative h-[60vh] md:h-[80vh] flex items-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center transition-transform duration-[10s] scale-105"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=1600&auto=format&fit=crop)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/60 via-slate-900/40 to-white" />
        </div>
        <div className="max-w-7xl mx-auto px-4 relative z-10 text-center text-white">
          <h1 className="text-4xl md:text-7xl font-black mb-6 font-display leading-tight drop-shadow-2xl animate-in slide-in-from-bottom duration-1000">
            AGRO BW: Conectando o agro a novas oportunidades de negócio.
          </h1>
          <p className="text-xl md:text-2xl text-slate-100 max-w-3xl mx-auto font-medium opacity-90 drop-shadow-md">
            A plataforma que simplifica, conecta e gera resultados no campo.
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 -mt-20 relative z-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 text-center border border-slate-50 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-5xl font-black text-green-700 mb-2 font-display">
              {formatCompactStat(realStats.activeUsers, data.stat_users_value)}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              {data.stat_users_label}
            </p>
          </div>
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 text-center border border-slate-50 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-5xl font-black text-green-700 mb-2 font-display">
              {formatCompactStat(realStats.createdAds, data.stat_ads_value)}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              {data.stat_ads_label}
            </p>
          </div>
          <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-slate-200/50 text-center border border-slate-50 transform hover:-translate-y-2 transition-transform duration-500">
            <div className="text-5xl font-black text-green-700 mb-2 font-display">
              {formatCompactStat(realStats.generatedDeals, data.stat_revenue_value)}
            </div>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">
              {data.stat_revenue_label}
            </p>
          </div>
        </div>
      </section>

      <section className="py-32 max-w-7xl mx-auto px-4 overflow-hidden">
        <div className="flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 space-y-8 animate-in slide-in-from-left duration-1000">
            <div className="inline-block bg-green-50 text-green-700 text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest">
              Fundada em 2025
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 font-display leading-tight">
              {data.history_title}
            </h2>
            <div className="w-20 h-2 bg-green-600 rounded-full" />
            <p className="text-lg text-slate-500 leading-relaxed font-medium text-justify">
              {data.history_text}
            </p>
          </div>
          <div className="flex-1 relative animate-in slide-in-from-right duration-1000">
            <div className="absolute -inset-4 bg-green-100 rounded-[3rem] -rotate-3" />
            <img
              src={
                data.history_image_url ||
                'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=800&auto=format&fit=crop'
              }
              alt="Produtor Rural"
              className="relative rounded-[3rem] shadow-2xl z-10 w-full h-[500px] object-cover"
            />
          </div>
        </div>
      </section>

      <section className="py-32 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-20">
            <h2 className="text-3xl font-black text-slate-900 mb-4 font-display">Nossos Pilares</h2>
            <p className="text-slate-500">O que nos guia todos os dias no campo e na cidade.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start">
            <div className="group bg-white rounded-[2.5rem] p-12 shadow-sm border border-slate-100 flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:border-green-600 hover:shadow-xl">
              <div className="w-20 h-20 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-8 transition-transform duration-300 group-hover:scale-110">
                <Target className="w-9 h-9" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 font-display text-center">
                {data.mission_title}
              </h3>
              <p className="text-slate-500 leading-relaxed text-left">
                {data.mission_text}
              </p>
            </div>
            <div className="group bg-white rounded-[2.5rem] p-12 shadow-sm border border-slate-100 flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:border-green-600 hover:shadow-xl">
              <div className="w-20 h-20 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-8 transition-transform duration-300 group-hover:scale-110">
                <Telescope className="w-9 h-9" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 font-display text-center">
                {data.vision_title}
              </h3>
              <p className="text-slate-500 leading-relaxed text-left">
                {data.vision_text}
              </p>
            </div>
            <div className="group bg-white rounded-[2.5rem] p-12 shadow-sm border border-slate-100 flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:border-green-600 hover:shadow-xl">
              <div className="w-20 h-20 rounded-full bg-green-100 text-green-700 flex items-center justify-center mx-auto mb-8 transition-transform duration-300 group-hover:scale-110">
                <Gem className="w-9 h-9" strokeWidth={1.5} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 font-display text-center">
                {data.values_title}
              </h3>
              {renderValuesContent(data.values_text)}
            </div>
          </div>
        </div>
      </section>

      <section className="py-32 max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="order-2 lg:order-1 grid grid-cols-1 gap-8">
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl">
                01
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 mb-2 font-display">{data.diff1_title}</h4>
                <p className="text-slate-500 leading-relaxed">{data.diff1_text}</p>
              </div>
            </div>
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl">
                02
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 mb-2 font-display">{data.diff2_title}</h4>
                <p className="text-slate-500 leading-relaxed">{data.diff2_text}</p>
              </div>
            </div>
            <div className="flex gap-6 items-start">
              <div className="w-14 h-14 bg-green-100 text-green-700 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl">
                03
              </div>
              <div>
                <h4 className="text-xl font-black text-slate-900 mb-2 font-display">{data.diff3_title}</h4>
                <p className="text-slate-500 leading-relaxed">{data.diff3_text}</p>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-8 font-display leading-tight">
              Por que a AGRO BW é <span className="text-green-700">diferente?</span>
            </h2>
            <p className="text-lg text-slate-500 mb-10 leading-relaxed font-medium">
              Não somos apenas um site de anúncios. Somos uma ferramenta estratégica para quem vive o agronegócio.
              Cada linha de código é pensada para suportar a robustez das operações rurais.
            </p>
            <div className="flex gap-4">
              <div className="flex -space-x-4">
                {trustUsers.map((u, i) => {
                  const showPhoto = Boolean(u.avatar) && !failedAvatars[i];
                  return (
                    <div
                      key={i}
                      className="w-12 h-12 rounded-full border-4 border-white overflow-hidden flex items-center justify-center text-white font-bold text-sm"
                      style={{ backgroundColor: showPhoto ? '#e2e8f0' : TRUST_AVATAR_COLORS[i % TRUST_AVATAR_COLORS.length] }}
                      title={u.name}
                    >
                      {showPhoto ? (
                        <img
                          src={u.avatar as string}
                          alt={u.name}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          onError={() => setFailedAvatars((prev) => ({ ...prev, [i]: true }))}
                        />
                      ) : (
                        <span>{getInitials(u.name)}</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="text-sm font-bold text-slate-400 self-center">
                {formatTrustLine(realStats.activeUsers)}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-32 bg-green-700 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/3 h-full bg-slate-900/10 skew-x-12 translate-x-10" />
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-8 font-display leading-tight">
            Faça parte da nossa história
          </h2>
          <p className="text-green-50 text-xl mb-12 max-w-2xl mx-auto opacity-90 leading-relaxed">
            Comece hoje mesmo a transformar o jeito que você faz negócios no campo. Anuncie grátis e conecte-se com
            compradores reais.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Link
              to="/anunciar"
              className="bg-slate-900 text-white px-12 py-6 rounded-[2rem] font-black text-xl hover:bg-slate-800 transition-all shadow-2xl hover:scale-105 active:scale-95"
            >
              Começar a Anunciar Agora
            </Link>
            <Link
              to="/anuncios"
              className="bg-white/10 backdrop-blur-md border border-white/20 text-white px-12 py-6 rounded-[2rem] font-black text-xl hover:bg-white/20 transition-all"
            >
              Explorar Ofertas
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AboutView;
