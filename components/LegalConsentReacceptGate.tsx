import React, { useEffect, useMemo, useState } from 'react';
import { FileText, LoaderCircle, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../src/lib/supabaseClient';
import { useAuth } from '../src/contexts/AuthContext';
import { useLayout } from '../src/contexts/LayoutContext';

interface PendingLegalConsent {
  consent_type: 'terms_of_use' | 'privacy_policy' | string;
  document_version: string;
  document_title: string;
  document_url: string;
  accepted_at: string | null;
}

const EXEMPT_PATHS = new Set(['/termos-de-uso', '/privacidade']);

const LegalConsentReacceptGate: React.FC = () => {
  const { user, signOut } = useAuth();
  const { settings } = useLayout();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingConsents, setPendingConsents] = useState<PendingLegalConsent[]>([]);

  const shouldSkip = useMemo(() => {
    if (!user) return true;
    if (location.pathname.startsWith('/admin')) return true;
    return EXEMPT_PATHS.has(location.pathname);
  }, [location.pathname, user]);

  const loadPendingConsents = async () => {
    if (!user || shouldSkip) {
      setPendingConsents([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const { data, error } = await supabase.rpc('list_my_pending_legal_consents');

    if (error) {
      console.error('[LegalConsent] Erro ao consultar pendencias de reaceite:', error);
      toast.error('Nao foi possivel validar seus documentos legais.', {
        description: 'Atualize a pagina ou tente novamente em instantes.',
      });
      setPendingConsents([]);
      setIsLoading(false);
      return;
    }

    setPendingConsents(((data as PendingLegalConsent[] | null) || []).map((row) => ({
      consent_type: row.consent_type,
      document_version: row.document_version,
      document_title: row.document_title,
      document_url: row.document_url,
      accepted_at: row.accepted_at,
    })));
    setIsLoading(false);
  };

  useEffect(() => {
    void loadPendingConsents();
  }, [user?.id, shouldSkip]);

  const handleAccept = async () => {
    setIsSubmitting(true);

    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const { error } = await supabase.rpc('accept_my_pending_legal_consents', {
      p_user_agent: userAgent || null,
    });

    if (error) {
      console.error('[LegalConsent] Erro ao registrar reaceite:', error);
      toast.error('Nao foi possivel registrar o reaceite agora.', {
        description: 'Tente novamente para continuar usando a plataforma.',
      });
      setIsSubmitting(false);
      return;
    }

    toast.success('Documentos atualizados com sucesso.', {
      description: 'Seu reaceite foi registrado e a conta segue liberada.',
    });

    await loadPendingConsents();
    setIsSubmitting(false);
  };

  if (shouldSkip || isLoading || pendingConsents.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100001] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div
          className="border-b px-6 py-5"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${settings.primaryColor} 12%, white), color-mix(in srgb, ${settings.secondaryColor} 10%, white))`,
            borderColor: `color-mix(in srgb, ${settings.primaryColor} 12%, #e2e8f0)`,
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 14%, white)` }}
            >
              <ShieldCheck className="h-6 w-6" style={{ color: settings.primaryColor }} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900">Atualizacao de documentos legais</h2>
              <p className="mt-1 text-sm font-medium text-slate-600">
                Os Termos de Uso e/ou a Política de Privacidade foram atualizados. Para continuar usando a plataforma,
                precisamos registrar seu novo aceite.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-6 py-6">
          {pendingConsents.map((consent) => (
            <div
              key={`${consent.consent_type}:${consent.document_version}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-xl bg-white p-2 shadow-sm">
                  <FileText className="h-5 w-5 text-slate-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-slate-900">{consent.document_title}</p>
                  <p className="mt-1 text-sm text-slate-500">Versao atual: {consent.document_version}</p>
                  <Link
                    to={consent.document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-sm font-bold hover:underline"
                    style={{ color: settings.primaryColor }}
                  >
                    Ler documento atualizado
                  </Link>
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            O acesso continua bloqueado para uso normal da plataforma ate o reaceite ser registrado.
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-6 py-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Sair da conta
          </button>
          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={isSubmitting}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: settings.primaryColor }}
          >
            {isSubmitting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Registrando aceite...
              </>
            ) : (
              'Li e aceito os documentos atualizados'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalConsentReacceptGate;
