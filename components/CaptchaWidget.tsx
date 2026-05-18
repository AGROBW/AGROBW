import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { debugLog } from '../src/utils/debugLog';
import { appError, appWarn } from '../src/utils/appLogger';

/**
 * Componente Captcha Wrapper
 * 
 * Suporta Cloudflare Turnstile (recomendado) ou hCaptcha
 * 
 * Para usar Turnstile:
 * 1. Criar conta em https://dash.cloudflare.com/
 * 2. Ir em "Turnstile" no menu lateral
 * 3. Criar novo site e copiar Site Key
 * 4. Adicionar variável de ambiente: VITE_TURNSTILE_SITE_KEY
 * 
 * Para usar hCaptcha:
 * 1. Criar conta em https://www.hcaptcha.com/
 * 2. Copiar Site Key
 * 3. Adicionar variável de ambiente: VITE_HCAPTCHA_SITE_KEY
 * 
 * Uso:
 * ```tsx
 * <CaptchaWidget 
 *   onVerify={(token) => setCaptchaToken(token)}
 *   onError={() => setCaptchaToken(null)}
 *   onExpire={() => setCaptchaToken(null)}
 * />
 * ```
 */

interface CaptchaWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'light' | 'dark';
  size?: 'normal' | 'compact';
}

declare global {
  interface Window {
    turnstile?: any;
    hcaptcha?: any;
    onTurnstileLoad?: () => void;
    onHcaptchaLoad?: () => void;
  }
}

export const CaptchaWidget: React.FC<CaptchaWidgetProps> = ({
  onVerify,
  onError,
  onExpire,
  theme = 'light',
  size = 'normal'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determinar qual captcha usar (Turnstile > hCaptcha > Mock)
  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  const hcaptchaSiteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY;
  
  const captchaProvider = turnstileSiteKey 
    ? 'turnstile' 
    : hcaptchaSiteKey 
    ? 'hcaptcha' 
    : 'mock';

  useEffect(() => {
    if (captchaProvider === 'mock') {
      appWarn('[Captcha] Nenhuma chave configurada. Usando mock para desenvolvimento', {
        provider: captchaProvider,
      });
      setIsLoaded(true);
      return;
    }

    const loadScript = () => {
      if (captchaProvider === 'turnstile') {
        loadTurnstileScript();
      } else if (captchaProvider === 'hcaptcha') {
        loadHcaptchaScript();
      }
    };

    loadScript();

    return () => {
      // Cleanup ao desmontar
      if (widgetIdRef.current) {
        if (captchaProvider === 'turnstile' && window.turnstile) {
          try {
            window.turnstile.remove(widgetIdRef.current);
          } catch (err) {
            appWarn('[Captcha] Erro ao remover Turnstile', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        } else if (captchaProvider === 'hcaptcha' && window.hcaptcha) {
          try {
            window.hcaptcha.remove(widgetIdRef.current);
          } catch (err) {
            appWarn('[Captcha] Erro ao remover hCaptcha', {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    };
  }, [captchaProvider]);

  const loadTurnstileScript = () => {
    if (window.turnstile) {
      setIsLoaded(true);
      renderTurnstile();
      return;
    }

    if (document.querySelector('script[src*="turnstile"]')) {
      return; // Já está carregando
    }

    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    
    window.onTurnstileLoad = () => {
      setIsLoaded(true);
      renderTurnstile();
    };

    script.addEventListener('load', () => {
      if (window.turnstile) {
        setIsLoaded(true);
        renderTurnstile();
      }
    });

    script.addEventListener('error', () => {
      setError('Falha ao carregar Turnstile');
      onError?.();
    });

    document.head.appendChild(script);
  };

  const loadHcaptchaScript = () => {
    if (window.hcaptcha) {
      setIsLoaded(true);
      renderHcaptcha();
      return;
    }

    if (document.querySelector('script[src*="hcaptcha"]')) {
      return; // Já está carregando
    }

    const script = document.createElement('script');
    script.src = 'https://js.hcaptcha.com/1/api.js';
    script.async = true;
    script.defer = true;
    
    window.onHcaptchaLoad = () => {
      setIsLoaded(true);
      renderHcaptcha();
    };

    script.addEventListener('load', () => {
      if (window.hcaptcha) {
        setIsLoaded(true);
        renderHcaptcha();
      }
    });

    script.addEventListener('error', () => {
      setError('Falha ao carregar hCaptcha');
      onError?.();
    });

    document.head.appendChild(script);
  };

  const renderTurnstile = () => {
    if (!window.turnstile || !containerRef.current || !turnstileSiteKey) return;

    try {
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: turnstileSiteKey,
        theme,
        size,
        callback: (token: string) => {
            debugLog('[Captcha] Turnstile verificado');
          onVerify(token);
        },
        'error-callback': () => {
          appError('[Captcha] Erro no Turnstile', undefined, {
            provider: 'turnstile',
          });
          setError('Erro na verificação');
          onError?.();
        },
        'expired-callback': () => {
          appWarn('[Captcha] Turnstile expirado', {
            provider: 'turnstile',
          });
          onExpire?.();
        }
      });
    } catch (err) {
      appError('[Captcha] Erro ao renderizar Turnstile', err, {
        provider: 'turnstile',
      });
      setError('Erro ao inicializar captcha');
      onError?.();
    }
  };

  const renderHcaptcha = () => {
    if (!window.hcaptcha || !containerRef.current || !hcaptchaSiteKey) return;

    try {
      widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
        sitekey: hcaptchaSiteKey,
        theme,
        size,
        callback: (token: string) => {
            debugLog('[Captcha] hCaptcha verificado');
          onVerify(token);
        },
        'error-callback': () => {
          appError('[Captcha] Erro no hCaptcha', undefined, {
            provider: 'hcaptcha',
          });
          setError('Erro na verificação');
          onError?.();
        },
        'expired-callback': () => {
          appWarn('[Captcha] hCaptcha expirado', {
            provider: 'hcaptcha',
          });
          onExpire?.();
        }
      });
    } catch (err) {
      appError('[Captcha] Erro ao renderizar hCaptcha', err, {
        provider: 'hcaptcha',
      });
      setError('Erro ao inicializar captcha');
      onError?.();
    }
  };

  const handleReset = () => {
    if (captchaProvider === 'turnstile' && window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current);
    } else if (captchaProvider === 'hcaptcha' && window.hcaptcha && widgetIdRef.current) {
      window.hcaptcha.reset(widgetIdRef.current);
    }
    setError(null);
  };

  // Mock para desenvolvimento (quando não há chave configurada)
  if (captchaProvider === 'mock') {
    return (
      <div className="border-2 border-dashed border-yellow-300 bg-yellow-50 rounded-lg p-4 text-center">
        <p className="text-xs font-bold text-yellow-800 uppercase tracking-wider mb-2">
          ⚠️ Captcha Mock (Dev Mode)
        </p>
        <p className="text-xs text-yellow-700 mb-3">
          Configure VITE_TURNSTILE_SITE_KEY ou VITE_HCAPTCHA_SITE_KEY
        </p>
        <button
          type="button"
          onClick={() => onVerify('mock-token-dev')}
          className="px-4 py-2 bg-yellow-600 text-white text-xs font-semibold rounded-lg hover:bg-yellow-700"
        >
          Simular Verificação
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-4 text-center">
        <p className="text-sm text-red-700 mb-3">{error}</p>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700"
        >
          <RefreshCw className="w-4 h-4" />
          Tentar Novamente
        </button>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div ref={containerRef} className="captcha-container" />
      {!isLoaded && (
        <div className="flex items-center gap-2 text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-xs">Carregando captcha...</span>
        </div>
      )}
    </div>
  );
};
