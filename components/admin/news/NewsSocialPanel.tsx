import React, { useMemo } from 'react';
import {
  CheckCircle2,
  ImageIcon,
  Info,
  Instagram,
  Linkedin,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Share2,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { NewsSocialPublicationRecord, NewsSocialSettingsRecord } from '../../../types';
import { supabase } from '../../../src/lib/supabaseClient';
import NewsSocialHelpModal from './NewsSocialHelpModal';

type SocialSettingsForm = {
  instagramEnabled: boolean;
  instagramUsername: string;
  instagramBusinessAccountId: string;
  instagramAccessToken: string;
  defaultInstagramStoryImageUrl: string;
  defaultInstagramStoryImagePath: string;
  linkedinEnabled: boolean;
  linkedinProfileType: 'member' | 'organization';
  linkedinProfileLabel: string;
  linkedinAuthorUrn: string;
  linkedinAccessToken: string;
  defaultLinkedinImageUrl: string;
  defaultLinkedinImagePath: string;
  autoPublishInstagramStory: boolean;
  autoPublishLinkedinPost: boolean;
  instagramStoryTemplate: string;
  linkedinPostTemplate: string;
  articleUrlBase: string;
};

interface NewsSocialPanelProps {
  settings: NewsSocialSettingsRecord | null;
  publications: NewsSocialPublicationRecord[];
  onSave: (payload: Partial<NewsSocialSettingsRecord>) => Promise<void>;
  onStartMetaConnect: () => Promise<{
    error: string | null;
    data: { authUrl: string; state: string; redirectUri: string } | null;
  }>;
  onCompleteMetaConnect: (
    code: string,
    state: string,
    redirectUri: string,
  ) => Promise<{
    error: string | null;
    data: {
      facebookPageId: string;
      facebookPageName: string;
      instagramBusinessAccountId: string;
      instagramUsername: string | null;
      expiresAt: string | null;
    } | null;
  }>;
  onValidateMetaConnect: () => Promise<{
    error: string | null;
    data: { status: string; expiresAt: string | null } | null;
  }>;
}

const inputClass = 'w-full rounded-xl border border-slate-200 px-4 py-3 text-sm';

const statusClassMap: Record<string, string> = {
  queued: 'bg-amber-50 text-amber-700 border border-amber-200',
  processing: 'bg-sky-50 text-sky-700 border border-sky-200',
  published: 'bg-green-50 text-green-700 border border-green-200',
  failed: 'bg-red-50 text-red-700 border border-red-200',
  disabled: 'bg-slate-100 text-slate-600 border border-slate-200',
};

const buildInitialState = (settings: NewsSocialSettingsRecord | null): SocialSettingsForm => ({
  instagramEnabled: settings?.instagramEnabled ?? false,
  instagramUsername: settings?.instagramUsername ?? '',
  instagramBusinessAccountId: settings?.instagramBusinessAccountId ?? '',
  instagramAccessToken: settings?.instagramAccessToken ?? '',
  defaultInstagramStoryImageUrl: settings?.defaultInstagramStoryImageUrl ?? '',
  defaultInstagramStoryImagePath: settings?.defaultInstagramStoryImagePath ?? '',
  linkedinEnabled: settings?.linkedinEnabled ?? false,
  linkedinProfileType: settings?.linkedinProfileType ?? 'organization',
  linkedinProfileLabel: settings?.linkedinProfileLabel ?? '',
  linkedinAuthorUrn: settings?.linkedinAuthorUrn ?? '',
  linkedinAccessToken: settings?.linkedinAccessToken ?? '',
  defaultLinkedinImageUrl: settings?.defaultLinkedinImageUrl ?? '',
  defaultLinkedinImagePath: settings?.defaultLinkedinImagePath ?? '',
  autoPublishInstagramStory: settings?.autoPublishInstagramStory ?? false,
  autoPublishLinkedinPost: settings?.autoPublishLinkedinPost ?? true,
  instagramStoryTemplate:
    settings?.instagramStoryTemplate ??
    'Nova materia publicada na AGRO BW: {{title}}. Leia no site: {{url}}',
  linkedinPostTemplate:
    settings?.linkedinPostTemplate ??
    'Nova materia na AGRO BW: {{title}}\n\n{{summary}}\n\nLeia a noticia completa: {{url}}',
  articleUrlBase: settings?.articleUrlBase ?? '',
});

const NewsSocialPanel: React.FC<NewsSocialPanelProps> = ({
  settings,
  publications,
  onSave,
  onStartMetaConnect,
  onCompleteMetaConnect,
  onValidateMetaConnect,
}) => {
  const [form, setForm] = React.useState<SocialSettingsForm>(() => buildInitialState(settings));
  const [isSaving, setIsSaving] = React.useState(false);
  const [uploadingField, setUploadingField] = React.useState<'instagram' | 'linkedin' | null>(null);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const [isConnectingMeta, setIsConnectingMeta] = React.useState(false);
  const [isValidatingMeta, setIsValidatingMeta] = React.useState(false);

  React.useEffect(() => {
    setForm(buildInitialState(settings));
  }, [settings]);

  React.useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.source !== 'meta-oauth-callback') return;

      const pendingState = window.sessionStorage.getItem('news_social_meta_oauth_state');
      const pendingRedirect = window.sessionStorage.getItem('news_social_meta_oauth_redirect_uri');
      if (!pendingState || !pendingRedirect) return;

      if (event.data?.state !== pendingState) {
        toast.error('A resposta da Meta nao corresponde ao estado esperado.');
        return;
      }

      if (event.data?.error) {
        toast.error(event.data?.error_description || 'A conexao com a Meta foi cancelada.');
        window.sessionStorage.removeItem('news_social_meta_oauth_state');
        window.sessionStorage.removeItem('news_social_meta_oauth_redirect_uri');
        return;
      }

      const code = typeof event.data?.code === 'string' ? event.data.code : '';
      if (!code) {
        toast.error('A Meta nao retornou um codigo de autorizacao valido.');
        return;
      }

      setIsConnectingMeta(true);
      const result = await onCompleteMetaConnect(code, pendingState, pendingRedirect);
      setIsConnectingMeta(false);
      window.sessionStorage.removeItem('news_social_meta_oauth_state');
      window.sessionStorage.removeItem('news_social_meta_oauth_redirect_uri');

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Instagram/Facebook conectados com sucesso.');
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onCompleteMetaConnect]);

  const latestPublications = useMemo(() => publications.slice(0, 10), [publications]);

  const updateField = <K extends keyof SocialSettingsForm>(field: K, value: SocialSettingsForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    await onSave({
      instagramEnabled: form.instagramEnabled,
      instagramUsername: form.instagramUsername || null,
      instagramBusinessAccountId: form.instagramBusinessAccountId || null,
      instagramAccessToken: form.instagramAccessToken || null,
      defaultInstagramStoryImageUrl: form.defaultInstagramStoryImageUrl || null,
      defaultInstagramStoryImagePath: form.defaultInstagramStoryImagePath || null,
      linkedinEnabled: form.linkedinEnabled,
      linkedinProfileType: form.linkedinProfileType,
      linkedinProfileLabel: form.linkedinProfileLabel || null,
      linkedinAuthorUrn: form.linkedinAuthorUrn || null,
      linkedinAccessToken: form.linkedinAccessToken || null,
      defaultLinkedinImageUrl: form.defaultLinkedinImageUrl || null,
      defaultLinkedinImagePath: form.defaultLinkedinImagePath || null,
      autoPublishInstagramStory: form.autoPublishInstagramStory,
      autoPublishLinkedinPost: form.autoPublishLinkedinPost,
      instagramStoryTemplate: form.instagramStoryTemplate || null,
      linkedinPostTemplate: form.linkedinPostTemplate || null,
      articleUrlBase: form.articleUrlBase || null,
    });
    setIsSaving(false);
  };

  const handleConnectMeta = async () => {
    setIsConnectingMeta(true);
    const result = await onStartMetaConnect();
    setIsConnectingMeta(false);

    if (result.error || !result.data) {
      toast.error(result.error || 'Nao foi possivel iniciar a conexao com a Meta.');
      return;
    }

    window.sessionStorage.setItem('news_social_meta_oauth_state', result.data.state);
    window.sessionStorage.setItem('news_social_meta_oauth_redirect_uri', result.data.redirectUri);

    const popup = window.open(
      result.data.authUrl,
      'meta-social-connect',
      'width=720,height=820,menubar=no,toolbar=no,location=no,status=no',
    );

    if (!popup) {
      toast.error('Nao foi possivel abrir a janela da Meta. Verifique o bloqueador de pop-up.');
    }
  };

  const handleValidateMeta = async () => {
    setIsValidatingMeta(true);
    const result = await onValidateMetaConnect();
    setIsValidatingMeta(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Conexao com a Meta validada.');
  };

  const handleAssetUpload = async (platform: 'instagram' | 'linkedin', file: File) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Selecione uma imagem JPG, PNG ou WEBP.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      toast.error('A arte deve ter no maximo 8MB.');
      return;
    }

    setUploadingField(platform);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `news-social/${platform}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('news_social_assets')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('news_social_assets').getPublicUrl(filePath);
      if (platform === 'instagram') {
        setForm((current) => ({
          ...current,
          defaultInstagramStoryImageUrl: data.publicUrl,
          defaultInstagramStoryImagePath: filePath,
        }));
      } else {
        setForm((current) => ({
          ...current,
          defaultLinkedinImageUrl: data.publicUrl,
          defaultLinkedinImagePath: filePath,
        }));
      }

      toast.success('Arte enviada. Clique em "Salvar integracoes" para publicar a alteracao.');
    } catch (error: any) {
      toast.error(error.message || 'Nao foi possivel enviar a arte.');
    } finally {
      setUploadingField(null);
    }
  };

  const renderAssetCard = (
    platform: 'instagram' | 'linkedin',
    title: string,
    helper: string,
    dimensions: string,
    urlField: 'defaultInstagramStoryImageUrl' | 'defaultLinkedinImageUrl',
    pathField: 'defaultInstagramStoryImagePath' | 'defaultLinkedinImagePath',
  ) => {
    const imageUrl = form[urlField];
    const isUploading = uploadingField === platform;

    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{title}</p>
            <p className="text-xs text-slate-500">{helper}</p>
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{dimensions}</p>
          </div>
          {imageUrl ? (
            <div className="flex h-20 min-w-[72px] items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
              <img src={imageUrl} alt={title} className="h-full w-full rounded-lg object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white text-slate-400">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {isUploading ? 'Enviando...' : 'Selecionar arte'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              disabled={isUploading}
              onChange={async (e) => {
                const input = e.currentTarget;
                const file = input.files?.[0];
                if (!file) return;
                await handleAssetUpload(platform, file);
                input.value = '';
              }}
            />
          </label>
          <input
            className={inputClass}
            placeholder="Ou use uma URL externa"
            value={form[urlField]}
            onChange={(e) => updateField(urlField, e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Caminho interno do storage (opcional)"
            value={form[pathField]}
            onChange={(e) => updateField(pathField, e.target.value)}
          />
        </div>
      </div>
    );
  };

  const instagramConnectionTone =
    settings?.instagramConnectionStatus === 'connected'
      ? 'bg-green-50 text-green-700 border-green-200'
      : settings?.instagramConnectionStatus === 'expiring_soon'
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : settings?.instagramConnectionStatus === 'expired'
          ? 'bg-red-50 text-red-700 border-red-200'
          : settings?.instagramConnectionStatus === 'error'
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Configuracao das redes sociais</h3>
          <p className="text-sm text-slate-500">
            Conecte Instagram e LinkedIn, defina as artes padrao e acompanhe a fila de publicacoes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsHelpOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <Info className="h-4 w-4" />
          Como configurar
        </button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Conexao automatica com Instagram/Facebook</h3>
                <p className="text-sm text-slate-500">
                  Preencha a pagina, a conta profissional e o token longo automaticamente pelo login da Meta.
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${instagramConnectionTone}`}>
                {settings?.instagramConnectionStatus === 'connected' ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {settings?.instagramConnectionStatus || 'disconnected'}
              </span>
              {settings?.facebookPageName ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  Pagina: {settings.facebookPageName}
                </span>
              ) : null}
              {settings?.instagramUsername ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  Perfil: @{settings.instagramUsername}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleValidateMeta}
              disabled={isValidatingMeta || isConnectingMeta}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isValidatingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
              {isValidatingMeta ? 'Validando...' : 'Validar conexao'}
            </button>
            <button
              type="button"
              onClick={handleConnectMeta}
              disabled={isConnectingMeta || isValidatingMeta}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isConnectingMeta ? <Loader2 className="h-4 w-4 animate-spin" /> : <Instagram className="h-4 w-4" />}
              {isConnectingMeta ? 'Conectando...' : 'Conectar Instagram/Facebook'}
            </button>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Conta profissional</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {settings?.instagramBusinessAccountId || 'Nao conectada'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Token expira em</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {settings?.instagramTokenExpiresAt
                ? new Date(settings.instagramTokenExpiresAt).toLocaleString('pt-BR')
                : 'Nao informado'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Ultima validacao</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {settings?.instagramTokenLastValidatedAt
                ? new Date(settings.instagramTokenLastValidatedAt).toLocaleString('pt-BR')
                : 'Ainda nao validado'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Pagina conectada</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {settings?.facebookPageName || settings?.facebookPageId || 'Nenhuma pagina encontrada'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-pink-600">
              <Instagram className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Instagram</h3>
              <p className="text-sm text-slate-500">Use a conexao automatica para preencher os dados tecnicos dessa conta.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Ativar integracao do Instagram</span>
              <input type="checkbox" checked={form.instagramEnabled} onChange={(e) => updateField('instagramEnabled', e.target.checked)} />
            </label>
            <input className={inputClass} placeholder="@seuperfil" value={form.instagramUsername} onChange={(e) => updateField('instagramUsername', e.target.value)} />
            <input className={inputClass} placeholder="Instagram Business Account ID" value={form.instagramBusinessAccountId} onChange={(e) => updateField('instagramBusinessAccountId', e.target.value)} />
            <input className={inputClass} placeholder="Access Token do Instagram" value={form.instagramAccessToken} onChange={(e) => updateField('instagramAccessToken', e.target.value)} />
            {renderAssetCard(
              'instagram',
              'Arte padrao do Instagram Story',
              'Usada como fallback quando a noticia nao tiver uma arte vertical propria.',
              'Recomendado: 1080 x 1920',
              'defaultInstagramStoryImageUrl',
              'defaultInstagramStoryImagePath',
            )}
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Publicar story automaticamente</span>
              <input type="checkbox" checked={form.autoPublishInstagramStory} onChange={(e) => updateField('autoPublishInstagramStory', e.target.checked)} />
            </label>
            <textarea
              className={`${inputClass} min-h-[120px]`}
              value={form.instagramStoryTemplate}
              onChange={(e) => updateField('instagramStoryTemplate', e.target.value)}
              placeholder="Template do story. Use {{title}} e {{url}}."
            />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Linkedin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">LinkedIn</h3>
              <p className="text-sm text-slate-500">Configure o LinkedIn manualmente enquanto a conexao automatica nao entra nessa fase.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Ativar integracao do LinkedIn</span>
              <input type="checkbox" checked={form.linkedinEnabled} onChange={(e) => updateField('linkedinEnabled', e.target.checked)} />
            </label>
            <select className={inputClass} value={form.linkedinProfileType} onChange={(e) => updateField('linkedinProfileType', e.target.value as 'member' | 'organization')}>
              <option value="organization">Pagina da empresa</option>
              <option value="member">Perfil pessoal</option>
            </select>
            <input className={inputClass} placeholder="Nome da pagina ou perfil" value={form.linkedinProfileLabel} onChange={(e) => updateField('linkedinProfileLabel', e.target.value)} />
            <input className={inputClass} placeholder="URN do autor (ex: urn:li:organization:123456)" value={form.linkedinAuthorUrn} onChange={(e) => updateField('linkedinAuthorUrn', e.target.value)} />
            <input className={inputClass} placeholder="Access Token do LinkedIn" value={form.linkedinAccessToken} onChange={(e) => updateField('linkedinAccessToken', e.target.value)} />
            {renderAssetCard(
              'linkedin',
              'Arte padrao do LinkedIn',
              'Usada como fallback para o post quando a noticia nao tiver uma arte especifica.',
              'Recomendado: 1200 x 627',
              'defaultLinkedinImageUrl',
              'defaultLinkedinImagePath',
            )}
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">Publicar post automaticamente</span>
              <input type="checkbox" checked={form.autoPublishLinkedinPost} onChange={(e) => updateField('autoPublishLinkedinPost', e.target.checked)} />
            </label>
            <textarea
              className={`${inputClass} min-h-[120px]`}
              value={form.linkedinPostTemplate}
              onChange={(e) => updateField('linkedinPostTemplate', e.target.value)}
              placeholder="Template do post. Use {{title}}, {{summary}} e {{url}}."
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            <Share2 className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Automacao de publicacao</h3>
            <p className="text-sm text-slate-500">Defina a base publica das noticias e acompanhe a fila social.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr,auto]">
          <input
            className={inputClass}
            placeholder="Base publica das noticias. Ex.: https://agrobw.com/noticias"
            value={form.articleUrlBase}
            onChange={(e) => updateField('articleUrlBase', e.target.value)}
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${isSaving ? 'animate-spin' : ''}`} />
            {isSaving ? 'Salvando...' : 'Salvar integracoes'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5">
          <h3 className="text-lg font-bold text-slate-900">Fila de publicacoes sociais</h3>
          <p className="text-sm text-slate-500">Toda noticia publicada pode gerar um job para Instagram e LinkedIn.</p>
        </div>

        {latestPublications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            Nenhuma publicacao social registrada ainda.
          </div>
        ) : (
          <div className="space-y-3">
            {latestPublications.map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 px-4 py-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{item.articleTitle || 'Publicacao social'}</span>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClassMap[item.status] || statusClassMap.disabled}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.platform === 'instagram' ? 'Instagram' : 'LinkedIn'} · {item.publicationType === 'story' ? 'Story' : 'Post'}
                    {item.targetLabel ? ` · ${item.targetLabel}` : ''}
                  </p>
                  {item.errorMessage ? <p className="mt-1 text-xs text-red-600">{item.errorMessage}</p> : null}
                </div>

                <div className="text-xs text-slate-400">
                  {new Date(item.updatedAt).toLocaleString('pt-BR')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewsSocialHelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
};

export default NewsSocialPanel;
