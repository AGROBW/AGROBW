import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Facebook, Globe, Instagram, Linkedin, Link as LinkIcon, MapPin, MessageCircle, ShieldCheck, Store } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import AdCard from '../components/AdCard';
import { usePublicSellerStore } from '../src/hooks/useSellerStore';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatStorePhone = (value?: string | null) => {
  if (!value) return '';

  const digits = value.replace(/\D/g, '');

  if (digits.length === 11) {
    return digits.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  }

  return value;
};

const StorefrontView: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { store, announcements, isLoading, error, locationLabel } = usePublicSellerStore(slug);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'price_asc' | 'price_desc' | 'views'>('recent');

  const filteredAnnouncements = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filtered = announcements.filter((announcement) => {
      if (!normalizedSearch) return true;

      return [announcement.title, announcement.description, announcement.subCategoryLabel]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'price_asc') return left.price - right.price;
      if (sortBy === 'price_desc') return right.price - left.price;
      if (sortBy === 'views') return (right.views || 0) - (left.views || 0);
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
  }, [announcements, searchTerm, sortBy]);

  const highlightStats = useMemo(() => {
    const homeHighlights = announcements.filter((announcement) => announcement.highlightHome).length;
    const categoryHighlights = announcements.filter((announcement) => announcement.highlightCategory).length;
    const averageTicket =
      announcements.length > 0
        ? announcements.reduce((total, announcement) => total + (announcement.price || 0), 0) / announcements.length
        : 0;

    return {
      homeHighlights,
      categoryHighlights,
      averageTicket,
    };
  }, [announcements]);

  const socialLinks = useMemo(() => {
    if (!store) return [];

    return [
      store.facebookUrl
        ? { id: 'facebook', label: 'Facebook', href: store.facebookUrl, icon: Facebook }
        : null,
      store.instagramUrl
        ? { id: 'instagram', label: 'Instagram', href: store.instagramUrl, icon: Instagram }
        : null,
      store.linkedinUrl
        ? { id: 'linkedin', label: 'LinkedIn', href: store.linkedinUrl, icon: Linkedin }
        : null,
      store.whatsapp
        ? {
            id: 'whatsapp',
            label: 'WhatsApp',
            href: `https://wa.me/${store.whatsapp.replace(/\D/g, '')}`,
            icon: MessageCircle,
          }
        : null,
      store.websiteUrl
        ? { id: 'site', label: 'Site', href: store.websiteUrl, icon: LinkIcon }
        : null,
    ].filter(Boolean) as Array<{
      id: string;
      label: string;
      href: string;
      icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    }>;
  }, [store]);

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-emerald-600" />
        <p className="mt-4 text-sm text-slate-500">Carregando loja...</p>
      </div>
    );
  }

  if (error || !store) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-3xl font-black text-slate-900">Loja não encontrada</h1>
        <p className="mt-3 max-w-md text-sm leading-6 text-slate-500">
          {error || 'A página da loja está indisponível no momento. Confira o endereço informado ou volte para a home da BWAGRO.'}
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
        >
          Voltar para a home
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-[#f5f7fb] pb-16">
      <section
        className="relative overflow-hidden"
        style={{
          backgroundImage: store.coverUrl
            ? `linear-gradient(90deg, rgba(9, 15, 25, 0.36) 0%, rgba(9, 15, 25, 0.28) 24%, rgba(9, 15, 25, 0.14) 48%, rgba(9, 15, 25, 0.08) 72%, rgba(9, 15, 25, 0.18) 100%), url(${store.coverUrl})`
            : 'linear-gradient(110deg, #f7f7f7 0%, #fff1e9 42%, #ff7a18 100%)',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.04)_0%,rgba(255,255,255,0.02)_36%,rgba(255,255,255,0)_68%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-10 lg:py-14">
          <div className="relative min-h-[220px] overflow-visible">
            <div className="absolute inset-x-3 bottom-1 md:inset-x-auto md:bottom-2 md:left-4 md:max-w-2xl">
              <div className="rounded-[1.6rem] border border-black/10 bg-black/55 p-4 text-white shadow-xl backdrop-blur-md md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center">
                  <div className="flex h-24 w-28 items-center justify-center overflow-hidden rounded-[1.25rem] bg-white shadow-lg md:w-32">
                    {store.logoUrl ? (
                      <img src={store.logoUrl} alt={store.storeName} className="h-full w-full object-contain p-3" />
                    ) : (
                      <ShieldCheck className="h-10 w-10 text-[#ff7a18]" strokeWidth={1.5} />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-2xl font-black text-white md:text-3xl">{store.storeName}</h2>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.26em] text-emerald-200">
                        <Store className="h-3.5 w-3.5" strokeWidth={1.5} />
                        Loja Oficial
                      </span>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-white/90">
                      {store.description || 'Loja oficial com presença institucional e catálogo dedicado dentro da BWAGRO.'}
                    </p>
                    {socialLinks.length > 0 ? (
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        {socialLinks.map((socialLink) => {
                          const Icon = socialLink.icon;

                          return (
                            <a
                              key={socialLink.id}
                              href={socialLink.href}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={socialLink.label}
                              title={socialLink.label}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/10 text-emerald-200 transition hover:border-white/20 hover:bg-white/15 hover:text-white"
                            >
                              <Icon className="h-4.5 w-4.5" strokeWidth={1.9} />
                            </a>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">Localização</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <MapPin className="h-4 w-4 text-emerald-200" strokeWidth={1.5} />
                      {locationLabel || 'Não informado'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">Contato</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <MessageCircle className="h-4 w-4 text-emerald-200" strokeWidth={1.5} />
                      {formatStorePhone(store.whatsapp) || store.email || 'Fale via anúncios'}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/10 p-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/65">Site</p>
                    {store.websiteUrl ? (
                      <a
                        href={store.websiteUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 flex items-center gap-2 text-sm font-semibold text-white hover:text-emerald-200"
                      >
                        <Globe className="h-4 w-4 text-emerald-200" strokeWidth={1.5} />
                        Acessar site
                        <ArrowUpRight className="h-4 w-4" strokeWidth={1.5} />
                      </a>
                    ) : (
                      <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white">
                        <Globe className="h-4 w-4 text-emerald-200" strokeWidth={1.5} />
                        Não informado
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="catalogo-loja" className="mx-auto max-w-7xl px-4 pt-10">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.3em] text-emerald-700">
              Catálogo da loja
            </span>
            <h2 className="mt-3 text-3xl font-black text-slate-900">Produtos publicados</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Explore os anúncios ativos da loja com filtros rápidos e uma experiência mais institucional para compradores do agro.
            </p>
          </div>

          <div className="rounded-[1.75rem] border border-slate-200 bg-white px-5 py-4 text-sm shadow-sm">
            <span className="text-slate-500">Resultados atuais</span>
            <p className="mt-1 text-2xl font-black text-slate-900">{filteredAnnouncements.length}</p>
          </div>
        </div>

        <div>
            {filteredAnnouncements.length > 0 ? (
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredAnnouncements.map((announcement) => (
                  <AdCard key={announcement.id} ad={announcement} />
                ))}
              </div>
            ) : (
              <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-16 text-center shadow-sm">
                <h3 className="text-xl font-black text-slate-900">Nenhum anúncio encontrado</h3>
                <p className="mt-3 text-sm text-slate-500">
                  Não encontramos anúncios com esse filtro. Tente ajustar a busca ou trocar a ordenação para explorar melhor o catálogo.
                </p>
              </div>
            )}
        </div>
      </section>
    </div>
  );
};

export default StorefrontView;
