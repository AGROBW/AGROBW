import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { LayoutSettings } from '../../types';

const DEFAULT_LAYOUT_SETTINGS: Omit<LayoutSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  siteName: 'BWAGRO',
  siteShortName: 'BWAGRO',
  siteTagline: 'Conectando o agro com tecnologia e mercado.',
  headerBrandText: 'BWAGRO',
  footerBrandText: 'BWAGRO Marketplace',
  loginBrandText: 'BWAGRO',
  seoTitle: 'BWAGRO',
  seoDescription: 'Marketplace do agronegocio brasileiro.',
  logoUrl: null,
  logoLightUrl: null,
  logoDarkUrl: null,
  faviconUrl: null,
  defaultAdImageUrl: null,
  facebookUrl: null,
  instagramUrl: null,
  youtubeUrl: null,
  linkedinUrl: null,
  whatsappUrl: null,
  tiktokUrl: null,
  primaryColor: '#16a34a',
  secondaryColor: '#0f172a',
  accentColor: '#f59e0b',
  backgroundColor: '#f8fafc',
  surfaceColor: '#ffffff',
  textColor: '#0f172a',
  mutedTextColor: '#64748b',
  successColor: '#16a34a',
  warningColor: '#f59e0b',
  errorColor: '#dc2626',
  lastUpdatedBy: null,
};

const mapLayoutSettings = (row: any): LayoutSettings => ({
  id: row.id,
  siteName: row.site_name ?? DEFAULT_LAYOUT_SETTINGS.siteName,
  siteShortName: row.site_short_name ?? DEFAULT_LAYOUT_SETTINGS.siteShortName,
  siteTagline: row.site_tagline ?? DEFAULT_LAYOUT_SETTINGS.siteTagline,
  headerBrandText: row.header_brand_text ?? DEFAULT_LAYOUT_SETTINGS.headerBrandText,
  footerBrandText: row.footer_brand_text ?? DEFAULT_LAYOUT_SETTINGS.footerBrandText,
  loginBrandText: row.login_brand_text ?? DEFAULT_LAYOUT_SETTINGS.loginBrandText,
  seoTitle: row.seo_title ?? DEFAULT_LAYOUT_SETTINGS.seoTitle,
  seoDescription: row.seo_description ?? DEFAULT_LAYOUT_SETTINGS.seoDescription,
  logoUrl: row.logo_url ?? null,
  logoLightUrl: row.logo_light_url ?? null,
  logoDarkUrl: row.logo_dark_url ?? null,
  faviconUrl: row.favicon_url ?? null,
  defaultAdImageUrl: row.default_ad_image_url ?? null,
  facebookUrl: row.facebook_url ?? null,
  instagramUrl: row.instagram_url ?? null,
  youtubeUrl: row.youtube_url ?? null,
  linkedinUrl: row.linkedin_url ?? null,
  whatsappUrl: row.whatsapp_url ?? null,
  tiktokUrl: row.tiktok_url ?? null,
  primaryColor: row.primary_color ?? DEFAULT_LAYOUT_SETTINGS.primaryColor,
  secondaryColor: row.secondary_color ?? DEFAULT_LAYOUT_SETTINGS.secondaryColor,
  accentColor: row.accent_color ?? DEFAULT_LAYOUT_SETTINGS.accentColor,
  backgroundColor: row.background_color ?? DEFAULT_LAYOUT_SETTINGS.backgroundColor,
  surfaceColor: row.surface_color ?? DEFAULT_LAYOUT_SETTINGS.surfaceColor,
  textColor: row.text_color ?? DEFAULT_LAYOUT_SETTINGS.textColor,
  mutedTextColor: row.muted_text_color ?? DEFAULT_LAYOUT_SETTINGS.mutedTextColor,
  successColor: row.success_color ?? DEFAULT_LAYOUT_SETTINGS.successColor,
  warningColor: row.warning_color ?? DEFAULT_LAYOUT_SETTINGS.warningColor,
  errorColor: row.error_color ?? DEFAULT_LAYOUT_SETTINGS.errorColor,
  lastUpdatedBy: row.last_updated_by ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const useLayoutSettings = () => {
  const [settings, setSettings] = useState<LayoutSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('layout_settings')
      .select('*')
      .limit(1)
      .maybeSingle();

    if (error) {
      setError(error.message);
      setSettings(null);
    } else {
      setSettings(data ? mapLayoutSettings(data) : null);
    }

    setIsLoading(false);
  };

  const saveSettings = async (payload: Partial<LayoutSettings>) => {
    const currentId = settings?.id;
    const dbPayload = {
      site_name: payload.siteName ?? settings?.siteName ?? DEFAULT_LAYOUT_SETTINGS.siteName,
      site_short_name: payload.siteShortName ?? settings?.siteShortName ?? DEFAULT_LAYOUT_SETTINGS.siteShortName,
      site_tagline: payload.siteTagline ?? settings?.siteTagline ?? DEFAULT_LAYOUT_SETTINGS.siteTagline,
      header_brand_text: payload.headerBrandText ?? settings?.headerBrandText ?? DEFAULT_LAYOUT_SETTINGS.headerBrandText,
      footer_brand_text: payload.footerBrandText ?? settings?.footerBrandText ?? DEFAULT_LAYOUT_SETTINGS.footerBrandText,
      login_brand_text: payload.loginBrandText ?? settings?.loginBrandText ?? DEFAULT_LAYOUT_SETTINGS.loginBrandText,
      seo_title: payload.seoTitle ?? settings?.seoTitle ?? DEFAULT_LAYOUT_SETTINGS.seoTitle,
      seo_description: payload.seoDescription ?? settings?.seoDescription ?? DEFAULT_LAYOUT_SETTINGS.seoDescription,
      logo_url: payload.logoUrl ?? settings?.logoUrl ?? null,
      logo_light_url: payload.logoLightUrl ?? settings?.logoLightUrl ?? null,
      logo_dark_url: payload.logoDarkUrl ?? settings?.logoDarkUrl ?? null,
      favicon_url: payload.faviconUrl ?? settings?.faviconUrl ?? null,
      default_ad_image_url: payload.defaultAdImageUrl ?? settings?.defaultAdImageUrl ?? null,
      facebook_url: payload.facebookUrl ?? settings?.facebookUrl ?? null,
      instagram_url: payload.instagramUrl ?? settings?.instagramUrl ?? null,
      youtube_url: payload.youtubeUrl ?? settings?.youtubeUrl ?? null,
      linkedin_url: payload.linkedinUrl ?? settings?.linkedinUrl ?? null,
      whatsapp_url: payload.whatsappUrl ?? settings?.whatsappUrl ?? null,
      tiktok_url: payload.tiktokUrl ?? settings?.tiktokUrl ?? null,
      primary_color: payload.primaryColor ?? settings?.primaryColor ?? DEFAULT_LAYOUT_SETTINGS.primaryColor,
      secondary_color: payload.secondaryColor ?? settings?.secondaryColor ?? DEFAULT_LAYOUT_SETTINGS.secondaryColor,
      accent_color: payload.accentColor ?? settings?.accentColor ?? DEFAULT_LAYOUT_SETTINGS.accentColor,
      background_color: payload.backgroundColor ?? settings?.backgroundColor ?? DEFAULT_LAYOUT_SETTINGS.backgroundColor,
      surface_color: payload.surfaceColor ?? settings?.surfaceColor ?? DEFAULT_LAYOUT_SETTINGS.surfaceColor,
      text_color: payload.textColor ?? settings?.textColor ?? DEFAULT_LAYOUT_SETTINGS.textColor,
      muted_text_color: payload.mutedTextColor ?? settings?.mutedTextColor ?? DEFAULT_LAYOUT_SETTINGS.mutedTextColor,
      success_color: payload.successColor ?? settings?.successColor ?? DEFAULT_LAYOUT_SETTINGS.successColor,
      warning_color: payload.warningColor ?? settings?.warningColor ?? DEFAULT_LAYOUT_SETTINGS.warningColor,
      error_color: payload.errorColor ?? settings?.errorColor ?? DEFAULT_LAYOUT_SETTINGS.errorColor,
      updated_at: new Date().toISOString(),
    };

    const query = currentId
      ? supabase.from('layout_settings').update(dbPayload).eq('id', currentId)
      : supabase.from('layout_settings').insert(dbPayload);

    const { error } = await query;

    if (error) {
      return { error: error.message };
    }

    await fetchSettings();
    return { error: null };
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return {
    settings,
    isLoading,
    error,
    fetchSettings,
    saveSettings,
    defaultSettings: DEFAULT_LAYOUT_SETTINGS,
  };
};
