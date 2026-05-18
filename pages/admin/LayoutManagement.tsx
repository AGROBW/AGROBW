import React, { useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, Save } from 'lucide-react';
import { toast } from 'sonner';
import LayoutBrandSection from '../../components/admin/layout/LayoutBrandSection';
import LayoutColorsSection from '../../components/admin/layout/LayoutColorsSection';
import LayoutIdentitySection from '../../components/admin/layout/LayoutIdentitySection';
import LayoutPageImagesSection, { PageImageField } from '../../components/admin/layout/LayoutPageImagesSection';
import LayoutPreviewPanel from '../../components/admin/layout/LayoutPreviewPanel';
import LayoutSocialLinksSection from '../../components/admin/layout/LayoutSocialLinksSection';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { useLayoutSettings } from '../../src/hooks/useLayoutSettings';
import { supabase } from '../../src/lib/supabaseClient';

const normalizeOptionalUrl = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const normalizeCommercialWhatsappNumber = (value: string | null | undefined) => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits || null;
};

const normalizeWhatsAppDestination = (value: string | null | undefined) => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && !/[a-z]/i.test(trimmed)) {
    return `https://wa.me/${digitsOnly}`;
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    const isWhatsAppHost =
      host === 'wa.me' ||
      host.endsWith('.wa.me') ||
      host === 'api.whatsapp.com' ||
      host.endsWith('.whatsapp.com') ||
      host === 'whatsapp.com';

    return isWhatsAppHost ? normalized : null;
  } catch {
    return null;
  }
};

const isValidWhatsAppDestination = (value: string | null | undefined) => {
  if (!value) return true;
  const trimmed = value.trim();
  if (!trimmed) return true;

  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 10 && digitsOnly.length <= 15 && !/[a-z]/i.test(trimmed)) {
    return true;
  }

  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'wa.me' ||
      host.endsWith('.wa.me') ||
      host === 'api.whatsapp.com' ||
      host.endsWith('.whatsapp.com') ||
      host === 'whatsapp.com'
    );
  } catch {
    return false;
  }
};

const LayoutManagement: React.FC = () => {
  const { settings, isLoading, saveSettings, defaultSettings } = useLayoutSettings();
  const { logAction } = useAdminAudit();
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<'logoUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'faviconUrl' | 'defaultAdImageUrl' | PageImageField | null>(null);
  const [formData, setFormData] = useState({
    siteName: defaultSettings.siteName,
    siteShortName: defaultSettings.siteShortName || '',
    siteTagline: defaultSettings.siteTagline || '',
    headerBrandText: defaultSettings.headerBrandText || '',
    footerBrandText: defaultSettings.footerBrandText || '',
    loginBrandText: defaultSettings.loginBrandText || '',
    seoTitle: defaultSettings.seoTitle || '',
    seoDescription: defaultSettings.seoDescription || '',
    logoUrl: defaultSettings.logoUrl || '',
    logoLightUrl: defaultSettings.logoLightUrl || '',
    logoDarkUrl: defaultSettings.logoDarkUrl || '',
    faviconUrl: defaultSettings.faviconUrl || '',
    defaultAdImageUrl: defaultSettings.defaultAdImageUrl || '',
    pricingHeroImageUrl: defaultSettings.pricingHeroImageUrl || '',
    pricingStoreImageUrl: defaultSettings.pricingStoreImageUrl || '',
    pricingFieldImageUrl: defaultSettings.pricingFieldImageUrl || '',
    sponsorHeroImageUrl: defaultSettings.sponsorHeroImageUrl || '',
    sponsorHarvestImageUrl: defaultSettings.sponsorHarvestImageUrl || '',
    sponsorFieldImageUrl: defaultSettings.sponsorFieldImageUrl || '',
    sponsorFinalCtaImageUrl: defaultSettings.sponsorFinalCtaImageUrl || '',
    commercialIntelligenceEnabled: defaultSettings.commercialIntelligenceEnabled ?? false,
    facebookUrl: defaultSettings.facebookUrl || '',
    instagramUrl: defaultSettings.instagramUrl || '',
    youtubeUrl: defaultSettings.youtubeUrl || '',
    linkedinUrl: defaultSettings.linkedinUrl || '',
    whatsappUrl: defaultSettings.whatsappUrl || '',
    commercialWhatsappNumber: defaultSettings.commercialWhatsappNumber || '',
    tiktokUrl: defaultSettings.tiktokUrl || '',
    primaryColor: defaultSettings.primaryColor,
    secondaryColor: defaultSettings.secondaryColor,
    accentColor: defaultSettings.accentColor,
    backgroundColor: defaultSettings.backgroundColor,
    surfaceColor: defaultSettings.surfaceColor,
    textColor: defaultSettings.textColor,
    mutedTextColor: defaultSettings.mutedTextColor,
    successColor: defaultSettings.successColor,
    warningColor: defaultSettings.warningColor,
    errorColor: defaultSettings.errorColor,
  });

  useEffect(() => {
    if (!settings) return;

    setFormData({
      siteName: settings.siteName || defaultSettings.siteName,
      siteShortName: settings.siteShortName || '',
      siteTagline: settings.siteTagline || '',
      headerBrandText: settings.headerBrandText || '',
      footerBrandText: settings.footerBrandText || '',
      loginBrandText: settings.loginBrandText || '',
      seoTitle: settings.seoTitle || '',
      seoDescription: settings.seoDescription || '',
      logoUrl: settings.logoUrl || '',
      logoLightUrl: settings.logoLightUrl || '',
      logoDarkUrl: settings.logoDarkUrl || '',
      faviconUrl: settings.faviconUrl || '',
      defaultAdImageUrl: settings.defaultAdImageUrl || '',
      pricingHeroImageUrl: settings.pricingHeroImageUrl || '',
      pricingStoreImageUrl: settings.pricingStoreImageUrl || '',
      pricingFieldImageUrl: settings.pricingFieldImageUrl || '',
      sponsorHeroImageUrl: settings.sponsorHeroImageUrl || '',
      sponsorHarvestImageUrl: settings.sponsorHarvestImageUrl || '',
      sponsorFieldImageUrl: settings.sponsorFieldImageUrl || '',
      sponsorFinalCtaImageUrl: settings.sponsorFinalCtaImageUrl || '',
      commercialIntelligenceEnabled: settings.commercialIntelligenceEnabled ?? false,
      facebookUrl: settings.facebookUrl || '',
      instagramUrl: settings.instagramUrl || '',
      youtubeUrl: settings.youtubeUrl || '',
      linkedinUrl: settings.linkedinUrl || '',
      whatsappUrl: settings.whatsappUrl || '',
      commercialWhatsappNumber: settings.commercialWhatsappNumber || '',
      tiktokUrl: settings.tiktokUrl || '',
      primaryColor: settings.primaryColor,
      secondaryColor: settings.secondaryColor,
      accentColor: settings.accentColor,
      backgroundColor: settings.backgroundColor,
      surfaceColor: settings.surfaceColor,
      textColor: settings.textColor,
      mutedTextColor: settings.mutedTextColor,
      successColor: settings.successColor,
      warningColor: settings.warningColor,
      errorColor: settings.errorColor,
    });
  }, [settings, defaultSettings]);

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleToggleChange = (field: keyof typeof formData, value: boolean) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleAssetUpload = async (
    field: 'logoUrl' | 'logoLightUrl' | 'logoDarkUrl' | 'faviconUrl' | 'defaultAdImageUrl' | PageImageField,
    file: File,
  ) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'];
    if (!validTypes.includes(file.type)) {
      toast.error('Selecione uma imagem válida para a identidade visual.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('O arquivo deve ter no máximo 5MB.');
      return;
    }

    setUploadingField(field);
    try {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `layout/${field}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('layout_assets')
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: '3600',
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('layout_assets').getPublicUrl(filePath);
      setFormData((current) => ({ ...current, [field]: data.publicUrl }));
      toast.success('Imagem enviada. Clique em "Salvar layout" para publicar a alteração.');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível enviar a imagem.');
    } finally {
      setUploadingField(null);
    }
  };

  const handleSave = async () => {
    if (!formData.siteName.trim()) {
      toast.error('Informe pelo menos o nome principal do site.');
      return;
    }

    const normalizedCommercialWhatsappNumber = normalizeCommercialWhatsappNumber(formData.commercialWhatsappNumber);
    if (formData.commercialWhatsappNumber.trim() && !normalizedCommercialWhatsappNumber) {
      toast.error('Informe um numero comercial valido para o WhatsApp.');
      return;
    }

    const normalizedWhatsappUrl = normalizeWhatsAppDestination(formData.whatsappUrl);

    setSaving(true);
    const previousValue = settings;

    const payload = {
      ...formData,
      siteShortName: formData.siteShortName || null,
      siteTagline: formData.siteTagline || null,
      headerBrandText: formData.headerBrandText || null,
      footerBrandText: formData.footerBrandText || null,
      loginBrandText: formData.loginBrandText || null,
      seoTitle: formData.seoTitle || null,
      seoDescription: formData.seoDescription || null,
      logoUrl: formData.logoUrl || null,
      logoLightUrl: formData.logoLightUrl || null,
      logoDarkUrl: formData.logoDarkUrl || null,
      faviconUrl: formData.faviconUrl || null,
      defaultAdImageUrl: formData.defaultAdImageUrl || null,
      pricingHeroImageUrl: formData.pricingHeroImageUrl || null,
      pricingStoreImageUrl: formData.pricingStoreImageUrl || null,
      pricingFieldImageUrl: formData.pricingFieldImageUrl || null,
      sponsorHeroImageUrl: formData.sponsorHeroImageUrl || null,
      sponsorHarvestImageUrl: formData.sponsorHarvestImageUrl || null,
      sponsorFieldImageUrl: formData.sponsorFieldImageUrl || null,
      sponsorFinalCtaImageUrl: formData.sponsorFinalCtaImageUrl || null,
      commercialIntelligenceEnabled: formData.commercialIntelligenceEnabled,
      facebookUrl: normalizeOptionalUrl(formData.facebookUrl),
      instagramUrl: normalizeOptionalUrl(formData.instagramUrl),
      youtubeUrl: normalizeOptionalUrl(formData.youtubeUrl),
      linkedinUrl: normalizeOptionalUrl(formData.linkedinUrl),
      whatsappUrl: normalizedWhatsappUrl,
      commercialWhatsappNumber: normalizedCommercialWhatsappNumber,
      tiktokUrl: normalizeOptionalUrl(formData.tiktokUrl),
    };

    const { error } = await saveSettings(payload);

    if (error) {
      toast.error(error);
      setSaving(false);
      return;
    }

    await logAction({
      action: ADMIN_ACTIONS.UPDATE_PAGE_CONTENT,
      resourceType: RESOURCE_TYPES.SYSTEM,
      resourceId: settings?.id || null,
      oldValue: previousValue as any,
      newValue: payload as any,
      reason: 'Configuracao de layout atualizada no painel administrativo',
    });

    toast.success('Layout salvo com sucesso.');
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-lg shadow-emerald-500/30">
            <MonitorSmartphone className="h-5 w-5" strokeWidth={2.2} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Layout e identidade visual</h1>
            <p className="text-sm text-slate-500">Centralize logo, favicon, textos de marca e paleta de cores.</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Salvando...' : 'Salvar layout'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <div className="space-y-6">
          <LayoutBrandSection
            formData={formData}
            onChange={handleChange}
            onUpload={handleAssetUpload}
            uploadingField={
              uploadingField === 'logoUrl' ||
              uploadingField === 'logoLightUrl' ||
              uploadingField === 'logoDarkUrl' ||
              uploadingField === 'faviconUrl' ||
              uploadingField === 'defaultAdImageUrl'
                ? uploadingField
                : null
            }
          />
          <LayoutPageImagesSection
            formData={{
              pricingHeroImageUrl: formData.pricingHeroImageUrl,
              pricingStoreImageUrl: formData.pricingStoreImageUrl,
              pricingFieldImageUrl: formData.pricingFieldImageUrl,
              sponsorHeroImageUrl: formData.sponsorHeroImageUrl,
              sponsorHarvestImageUrl: formData.sponsorHarvestImageUrl,
              sponsorFieldImageUrl: formData.sponsorFieldImageUrl,
              sponsorFinalCtaImageUrl: formData.sponsorFinalCtaImageUrl,
            }}
            onChange={handleChange}
            onUpload={handleAssetUpload}
            uploadingField={
              uploadingField === 'pricingHeroImageUrl' ||
              uploadingField === 'pricingStoreImageUrl' ||
              uploadingField === 'pricingFieldImageUrl' ||
              uploadingField === 'sponsorHeroImageUrl' ||
              uploadingField === 'sponsorHarvestImageUrl' ||
              uploadingField === 'sponsorFieldImageUrl' ||
              uploadingField === 'sponsorFinalCtaImageUrl'
                ? uploadingField
                : null
            }
          />
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Recursos do painel</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">Inteligência comercial</h3>
                <p className="mt-1 max-w-2xl text-sm text-slate-500">
                  Oculta ou reativa o menu e a rota do módulo no painel do usuário sem remover a implementação do projeto.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleChange('commercialIntelligenceEnabled', !formData.commercialIntelligenceEnabled)}
                className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  formData.commercialIntelligenceEnabled
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    formData.commercialIntelligenceEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                />
                {formData.commercialIntelligenceEnabled ? 'Menu ativo' : 'Menu oculto'}
              </button>
            </div>
          </section>
          <LayoutIdentitySection
            formData={{
              siteTagline: formData.siteTagline,
              headerBrandText: formData.headerBrandText,
              footerBrandText: formData.footerBrandText,
              loginBrandText: formData.loginBrandText,
              seoTitle: formData.seoTitle,
              seoDescription: formData.seoDescription,
            }}
            onChange={handleChange}
          />
          <LayoutColorsSection
            formData={{
              primaryColor: formData.primaryColor,
              secondaryColor: formData.secondaryColor,
              accentColor: formData.accentColor,
              backgroundColor: formData.backgroundColor,
              surfaceColor: formData.surfaceColor,
              textColor: formData.textColor,
              mutedTextColor: formData.mutedTextColor,
              successColor: formData.successColor,
              warningColor: formData.warningColor,
              errorColor: formData.errorColor,
            }}
            onChange={handleChange}
          />
          <LayoutSocialLinksSection
            formData={{
              facebookUrl: formData.facebookUrl,
              instagramUrl: formData.instagramUrl,
              youtubeUrl: formData.youtubeUrl,
              linkedinUrl: formData.linkedinUrl,
              whatsappUrl: formData.whatsappUrl,
              commercialWhatsappNumber: formData.commercialWhatsappNumber,
              tiktokUrl: formData.tiktokUrl,
            }}
            onChange={handleChange}
          />
        </div>

        <div className="space-y-6">
          <LayoutPreviewPanel
            settings={{
              siteName: formData.siteName,
              siteTagline: formData.siteTagline,
              headerBrandText: formData.headerBrandText,
              footerBrandText: formData.footerBrandText,
              primaryColor: formData.primaryColor,
              secondaryColor: formData.secondaryColor,
              accentColor: formData.accentColor,
              backgroundColor: formData.backgroundColor,
              surfaceColor: formData.surfaceColor,
              textColor: formData.textColor,
              mutedTextColor: formData.mutedTextColor,
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default LayoutManagement;
