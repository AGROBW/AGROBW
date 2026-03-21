import React, { createContext, ReactNode, useContext, useEffect, useMemo } from 'react';
import { LayoutSettings } from '../../types';
import { useLayoutSettings } from '../hooks/useLayoutSettings';

interface LayoutContextValue {
  settings: LayoutSettings;
  isLoading: boolean;
}

const LayoutContext = createContext<LayoutContextValue | undefined>(undefined);

const applyLayoutSettingsToDocument = (settings: LayoutSettings) => {
  if (typeof document === 'undefined') return;

  document.title = settings.seoTitle || settings.siteName;

  let description = document.querySelector('meta[name="description"]');
  if (!description) {
    description = document.createElement('meta');
    description.setAttribute('name', 'description');
    document.head.appendChild(description);
  }
  description.setAttribute('content', settings.seoDescription || settings.siteTagline || settings.siteName);

  if (settings.faviconUrl) {
    let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = settings.faviconUrl;
  }

  const root = document.documentElement;
  root.style.setProperty('--brand-primary', settings.primaryColor);
  root.style.setProperty('--brand-secondary', settings.secondaryColor);
  root.style.setProperty('--brand-accent', settings.accentColor);
  root.style.setProperty('--brand-background', settings.backgroundColor);
  root.style.setProperty('--brand-surface', settings.surfaceColor);
  root.style.setProperty('--brand-text', settings.textColor);
  root.style.setProperty('--brand-muted', settings.mutedTextColor);
  root.style.setProperty('--brand-success', settings.successColor);
  root.style.setProperty('--brand-warning', settings.warningColor);
  root.style.setProperty('--brand-error', settings.errorColor);
};

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { settings, isLoading, defaultSettings } = useLayoutSettings();

  const resolvedSettings = useMemo<LayoutSettings>(() => {
    const now = new Date().toISOString();

    return settings ?? {
      id: 'layout-default',
      ...defaultSettings,
      createdAt: now,
      updatedAt: now,
    };
  }, [defaultSettings, settings]);

  useEffect(() => {
    applyLayoutSettingsToDocument(resolvedSettings);
  }, [resolvedSettings]);

  return (
    <LayoutContext.Provider value={{ settings: resolvedSettings, isLoading }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => {
  const context = useContext(LayoutContext);

  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider');
  }

  return context;
};
