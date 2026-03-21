import React, { useEffect, useState } from 'react';
import { Loader2, MonitorSmartphone, Save } from 'lucide-react';
import { toast } from 'sonner';
import LayoutBrandSection from '../../components/admin/layout/LayoutBrandSection';
import LayoutColorsSection from '../../components/admin/layout/LayoutColorsSection';
import LayoutIdentitySection from '../../components/admin/layout/LayoutIdentitySection';
import LayoutPreviewPanel from '../../components/admin/layout/LayoutPreviewPanel';
import { useAdminAudit, ADMIN_ACTIONS, RESOURCE_TYPES } from '../../src/hooks/useAdminAudit';
import { useLayoutSettings } from '../../src/hooks/useLayoutSettings';

const LayoutManagement: React.FC = () => {
  const { settings, isLoading, saveSettings, defaultSettings } = useLayoutSettings();
  const { logAction } = useAdminAudit();
  const [saving, setSaving] = useState(false);
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

  const handleSave = async () => {
    if (!formData.siteName.trim()) {
      toast.error('Informe pelo menos o nome principal do site.');
      return;
    }

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
          <LayoutBrandSection formData={formData} onChange={handleChange} />
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
