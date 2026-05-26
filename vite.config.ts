import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * IMPORTANTE DE SEGURANÇA:
 * Variáveis com prefixo VITE_ são expostas ao browser — use apenas para valores
 * que podem ser públicos (ex: VITE_SUPABASE_ANON_KEY, VITE_SUPABASE_URL).
 *
 * NUNCA injete chaves de servidor (GEMINI_API_KEY, STRIPE_SECRET_KEY, etc.)
 * via define ou VITE_ — elas ficam visíveis no bundle JavaScript público.
 *
 * VULN-005 fix: Removida injeção de process.env.GEMINI_API_KEY no bundle.
 * Use a GEMINI_API_KEY exclusivamente em Edge Functions Deno (server-side).
 */
export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  // Sem `define` com chaves de API — todas as integrações AI ficam no servidor
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
