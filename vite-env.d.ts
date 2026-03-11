/// <reference types="vite/client" />

// Tipagem para variáveis de ambiente do Vite
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
  readonly VITE_HCAPTCHA_SITE_KEY?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_MERCADOPAGO_PUBLIC_KEY?: string
  readonly VITE_APP_VERSION?: string
  readonly VITE_ENABLE_ANALYTICS?: string
  readonly VITE_ENABLE_DEBUG_MODE?: string
  readonly VITE_ENABLE_MAINTENANCE_MODE?: string
  readonly VITE_APP_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_WHATSAPP_NUMBER?: string
  readonly VITE_GA_TRACKING_ID?: string
  readonly VITE_SENTRY_DSN?: string
  readonly VITE_LOGROCKET_APP_ID?: string
  // Adicione mais variáveis de ambiente conforme necessário
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
