import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Image, Link as LinkIcon, MapPin, Save, ShieldCheck, ShoppingBag, Store, UploadCloud, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../src/contexts/AuthContext';
import { slugifyStoreValue, useMySellerStore } from '../../src/hooks/useSellerStore';
import { supabase } from '../../src/lib/supabaseClient';

type SellerStoreDashboardProps = {
  hasStoreAccess: boolean;
};

const STORE_DESCRIPTION_MAX_LENGTH = 280;

const SellerStoreDashboard: React.FC<SellerStoreDashboardProps> = ({ hasStoreAccess }) => {
  const { user } = useAuth();
  const { store, isLoading, isSaving, saveStore } = useMySellerStore();
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [formData, setFormData] = useState({
    storeName: '',
    slug: '',
    description: '',
    logoUrl: '',
    coverUrl: '',
    email: '',
    facebookUrl: '',
    instagramUrl: '',
    linkedinUrl: '',
    websiteUrl: '',
    city: '',
    state: '',
    isActive: true,
  });

  useEffect(() => {
    if (store) {
      setFormData({
        storeName: store.storeName || '',
        slug: store.slug || '',
        description: store.description || '',
        logoUrl: store.logoUrl || '',
        coverUrl: store.coverUrl || '',
        email: store.email || user?.email || '',
        facebookUrl: store.facebookUrl || '',
        instagramUrl: store.instagramUrl || '',
        linkedinUrl: store.linkedinUrl || '',
        websiteUrl: store.websiteUrl || '',
        city: store.city || user?.cidade || '',
        state: store.state || user?.estado || '',
        isActive: store.isActive,
      });
      return;
    }

    setFormData((current) => ({
      ...current,
      email: current.email || user?.email || '',
      facebookUrl: current.facebookUrl || '',
      instagramUrl: current.instagramUrl || '',
      linkedinUrl: current.linkedinUrl || '',
      websiteUrl: current.websiteUrl || '',
      city: current.city || user?.cidade || '',
      state: current.state || user?.estado || '',
    }));
  }, [store, user]);

  const publicStoreUrl = useMemo(() => {
    const normalizedSlug = formData.slug || slugifyStoreValue(formData.storeName);
    if (!normalizedSlug || typeof window === 'undefined') return null;
    return `${window.location.origin}/#/loja/${normalizedSlug}`;
  }, [formData.slug, formData.storeName]);

  const handleChange = (field: keyof typeof formData, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleStoreNameBlur = () => {
    if (!formData.slug && formData.storeName) {
      handleChange('slug', slugifyStoreValue(formData.storeName));
    }
  };

  const handleSave = async () => {
    try {
      await saveStore(formData, hasStoreAccess);
      toast.success('Loja salva com sucesso.');
    } catch (error: any) {
      toast.error(error?.message || 'Não foi possível salvar sua loja.');
    }
  };

  const uploadStoreAsset = async (
    event: React.ChangeEvent<HTMLInputElement>,
    assetType: 'logoUrl' | 'coverUrl'
  ) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Selecione uma imagem válida.');
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('A imagem deve ter no máximo 5MB.');
      event.target.value = '';
      return;
    }

    const setUploading = assetType === 'logoUrl' ? setIsUploadingLogo : setIsUploadingCover;
    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = assetType === 'logoUrl' ? `logo.${fileExt}` : `cover.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('seller-stores')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('seller-stores')
        .getPublicUrl(filePath);

      setFormData((current) => ({
        ...current,
        [assetType]: publicUrlData.publicUrl,
      }));

      toast.success(assetType === 'logoUrl' ? 'Logo enviada com sucesso.' : 'Capa enviada com sucesso.');
    } catch (error: any) {
      console.error('[SellerStoreDashboard] Erro ao fazer upload da imagem da loja:', error);
      toast.error(error?.message || 'Não foi possível enviar a imagem.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-100" />
          <div className="h-28 rounded-3xl bg-slate-100" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
            <div className="h-14 rounded-2xl bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-[2rem] border border-emerald-100 bg-white shadow-sm">
        <div className="relative bg-gradient-to-r from-slate-950 via-slate-900 to-emerald-950 px-8 py-10 text-white">
          <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,_rgba(74,222,128,0.28),_transparent_60%)] md:block" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-black uppercase tracking-[0.3em] text-emerald-200">
                <Store className="h-4 w-4" strokeWidth={1.5} />
                Loja Oficial
              </span>
              <div>
                <h1 className="text-3xl font-black tracking-tight">Monte a vitrine oficial do seu negócio no agro</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200">
                  Personalize sua presença dentro da BWAGRO com logo, capa, descrição institucional e uma página pública dedicada para concentrar todos os seus anúncios.
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm backdrop-blur lg:min-w-[320px]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">Status da loja</span>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${hasStoreAccess ? 'bg-emerald-400/15 text-emerald-200' : 'bg-amber-400/15 text-amber-200'}`}>
                  {hasStoreAccess ? 'Recurso liberado' : 'Exige plano Loja Oficial'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">Página pública</span>
                <span className="font-semibold text-white">{store ? 'Disponível para edição' : 'Pronta para criar'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-300">Exposição</span>
                <span className="font-semibold text-white">Perfil institucional + catálogo</span>
              </div>
            </div>
          </div>
        </div>

        {!hasStoreAccess ? (
          <div className="border-t border-amber-100 bg-amber-50/70 px-8 py-5 text-sm text-amber-900">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <p>
                Seu plano atual não inclui a Loja Oficial. Faça upgrade para publicar uma página da sua empresa com identidade própria e catálogo dedicado.
              </p>
              <Link
                to="/planos"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
              >
                Ver planos
              </Link>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid gap-8 xl:grid-cols-[1.25fr,0.95fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black text-slate-900">Dados da loja</h2>
              <p className="mt-1 text-sm text-slate-500">
                Configure o nome, endereço público e informações institucionais que aparecem na sua página.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !hasStoreAccess}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" strokeWidth={1.5} />
              {isSaving ? 'Salvando...' : 'Salvar loja'}
            </button>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Nome da loja</span>
              <input
                value={formData.storeName}
                onChange={(event) => handleChange('storeName', event.target.value)}
                onBlur={handleStoreNameBlur}
                placeholder="Ex.: Agro Freitas Goiás"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-semibold text-slate-700">Slug da loja</span>
              <input
                value={formData.slug}
                onChange={(event) => handleChange('slug', slugifyStoreValue(event.target.value))}
                placeholder="agro-freitas-goias"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm lowercase outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">Descrição da loja</span>
                <span className="text-xs font-semibold text-slate-400">
                  {formData.description.length}/{STORE_DESCRIPTION_MAX_LENGTH}
                </span>
              </div>
              <textarea
                value={formData.description}
                onChange={(event) => handleChange('description', event.target.value)}
                maxLength={STORE_DESCRIPTION_MAX_LENGTH}
                rows={5}
                placeholder="Conte quem vocês são, há quanto tempo atuam, quais categorias trabalham e por que os compradores devem confiar na sua loja."
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
              <p className="text-xs text-slate-500">
                Use uma apresentação curta e objetiva da empresa, destacando atuação, região e tipo de produto.
              </p>
            </label>

            <div className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Image className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Logo da loja
              </span>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/50">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isUploadingLogo ? 'Enviando logo...' : formData.logoUrl ? 'Trocar logo atual' : 'Selecionar imagem do logo'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">PNG, JPG ou WEBP com até 5MB. Recomendado: 600x600 px, com fundo limpo e boa margem.</p>
                </div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={!hasStoreAccess || isUploadingLogo}
                  onChange={(event) => {
                    void uploadStoreAsset(event, 'logoUrl');
                  }}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Image className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Capa da loja
              </span>
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 transition hover:border-emerald-300 hover:bg-emerald-50/50">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {isUploadingCover ? 'Enviando capa...' : formData.coverUrl ? 'Trocar capa atual' : 'Selecionar imagem da capa'}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">Use uma imagem horizontal para valorizar a abertura da loja. Recomendado: 1600x500 px, com o conteúdo principal centralizado e margem de segurança nas laterais para evitar cortes.</p>
                </div>
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-emerald-700 shadow-sm">
                  <UploadCloud className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  disabled={!hasStoreAccess || isUploadingCover}
                  onChange={(event) => {
                    void uploadStoreAsset(event, 'coverUrl');
                  }}
                />
              </label>
            </div>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <UserRound className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                E-mail de contato
              </span>
              <input
                value={formData.email}
                onChange={(event) => handleChange('email', event.target.value)}
                placeholder="contato@sualoja.com.br"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <LinkIcon className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Facebook
              </span>
              <input
                value={formData.facebookUrl}
                onChange={(event) => handleChange('facebookUrl', event.target.value)}
                placeholder="facebook.com/sualoja"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <LinkIcon className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Instagram
              </span>
              <input
                value={formData.instagramUrl}
                onChange={(event) => handleChange('instagramUrl', event.target.value)}
                placeholder="https://instagram.com/sualoja"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <LinkIcon className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                LinkedIn
              </span>
              <input
                value={formData.linkedinUrl}
                onChange={(event) => handleChange('linkedinUrl', event.target.value)}
                placeholder="linkedin.com/company/sualoja"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Globe className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Site
              </span>
              <input
                value={formData.websiteUrl}
                onChange={(event) => handleChange('websiteUrl', event.target.value)}
                placeholder="https://sualoja.com.br"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Cidade
              </span>
              <input
                value={formData.city}
                onChange={(event) => handleChange('city', event.target.value)}
                placeholder="Itumbiara"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="space-y-2">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <MapPin className="h-4 w-4 text-slate-400" strokeWidth={1.5} />
                Estado
              </span>
              <input
                value={formData.state}
                onChange={(event) => handleChange('state', event.target.value)}
                placeholder="GO"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm uppercase outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Loja visível publicamente</p>
              <p className="text-xs text-slate-500">Desative temporariamente se quiser pausar a página da loja.</p>
            </div>
            <button
              type="button"
              onClick={() => handleChange('isActive', !formData.isActive)}
              disabled={!hasStoreAccess}
              className={`inline-flex h-11 items-center rounded-full px-5 text-sm font-bold transition ${
                formData.isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {formData.isActive ? 'Ativa' : 'Oculta'}
            </button>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div
              className="h-40 bg-cover bg-center"
              style={{
                backgroundImage: formData.coverUrl
                  ? `linear-gradient(90deg, rgba(9, 15, 25, 0.36) 0%, rgba(9, 15, 25, 0.28) 24%, rgba(9, 15, 25, 0.14) 48%, rgba(9, 15, 25, 0.08) 72%, rgba(9, 15, 25, 0.18) 100%), url(${formData.coverUrl})`
                  : 'linear-gradient(135deg, #022c22 0%, #064e3b 45%, #0f172a 100%)',
              }}
            />
            <div className="relative px-6 pb-6">
              <div className="-mt-10 flex h-20 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-white text-slate-500 shadow-sm">
                {formData.logoUrl ? (
                  <img src={formData.logoUrl} alt={formData.storeName || 'Logo da loja'} className="h-full w-full object-contain p-2.5" />
                ) : (
                  <ShoppingBag className="h-8 w-8" strokeWidth={1.5} />
                )}
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-slate-900">{formData.storeName || 'Sua loja oficial'}</h3>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                      <Store className="h-3.5 w-3.5" strokeWidth={1.5} />
                      Loja Oficial
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {publicStoreUrl ? publicStoreUrl.replace(`${window.location.origin}/#/`, '') : '/loja/seu-endereco'}
                  </p>
                </div>

                <p className="text-sm leading-6 text-slate-600">
                  {formData.description || 'Apresente sua empresa, especialidades e diferenciais para aumentar a confiança dos compradores que chegarem pela BWAGRO.'}
                </p>

                <div className="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center justify-between gap-3">
                    <span>Localização</span>
                    <span className="font-semibold text-slate-800">{[formData.city, formData.state].filter(Boolean).join(' - ') || 'Não informada'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>E-mail</span>
                    <span className="font-semibold text-slate-800">{formData.email || 'Não informado'}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>Status público</span>
                    <span className={`font-semibold ${formData.isActive ? 'text-emerald-700' : 'text-slate-500'}`}>
                      {formData.isActive ? 'Página publicada' : 'Página oculta'}
                    </span>
                  </div>
                </div>

                {publicStoreUrl ? (
                  <a
                    href={publicStoreUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                  >
                    <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
                    Abrir página pública
                  </a>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-black text-slate-900">Estratégia recomendada</h3>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
              <li>Use um nome comercial claro e fácil de lembrar para fortalecer a busca da sua marca.</li>
              <li>Adicione uma descrição institucional curta, focando em região atendida, tempo de mercado e tipos de produto.</li>
              <li>Mantenha logo e capa alinhados com sua identidade para transformar seus anúncios em uma vitrine profissional.</li>
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
};

export default SellerStoreDashboard;
