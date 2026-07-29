import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronLeft,
  Eye,
  EyeOff,
  LoaderCircle,
  MapPin,
  Sprout
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../src/contexts/AuthContext';
import { useLayout } from '../src/contexts/LayoutContext';
import { supabase } from '../src/lib/supabaseClient';
import SeoHead from '../components/SeoHead';
import { CaptchaWidget } from '../components/CaptchaWidget';

type ProfileType = 'individual' | 'company' | null;

interface InviteCampaignPreview {
  id: string;
  code: string;
  captor_name: string;
}

const buildInviteSessionStorageKey = (code: string) => `bwagro:invite-session:${code.toUpperCase()}`;

const createInviteSessionId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `invite-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const RegisterView: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signUp, user } = useAuth();
  const { settings } = useLayout();

  const [profileType, setProfileType] = useState<ProfileType>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [documentTouched, setDocumentTouched] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    document: '',
    phone: '',
    birthDate: '',
    website: '',
    email: '',
    password: '',
    confirmPassword: '',
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const redirectTarget = searchParams.get('redirect') || '/minha-conta';
  const contactSellerIntent = searchParams.get('intent') === 'contact-seller';
  const inviteCode = (searchParams.get('invite') || searchParams.get('ref') || '').trim().toUpperCase();
  const registerLoginLink = `/login${location.search}`;
  const registerHeroImage =
    settings.registerHeroImageUrl ||
    'https://images.unsplash.com/photo-1595079676339-1534801ad6cf?q=80&w=1600&auto=format&fit=crop';
  const [invitePreview, setInvitePreview] = useState<InviteCampaignPreview | null>(null);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [inviteLookupFailed, setInviteLookupFailed] = useState(false);

  const buildPostAuthRedirect = (fallbackPath: string) => {
    const baseTarget = redirectTarget || fallbackPath;

    if (!contactSellerIntent) {
      return baseTarget || fallbackPath;
    }

    const separator = baseTarget.includes('?') ? '&' : '?';
    return `${baseTarget}${separator}openContactSeller=1`;
  };

  const onlyDigits = (value: string) => value.replace(/\D/g, '');

  const maskCPF = (value: string) => {
    const digits = onlyDigits(value).slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const maskCNPJ = (value: string) => {
    const digits = onlyDigits(value).slice(0, 14);
    return digits
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
  };

  const maskPhone = (value: string) => {
    const digits = onlyDigits(value).slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
    }

    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
  };

  const getDocumentLabel = () => (profileType === 'individual' ? 'CPF' : 'CNPJ');

  const maskDocument = (value: string) => {
    if (profileType === 'company') return maskCNPJ(value);
    return maskCPF(value);
  };

  const hasAllEqualDigits = (value: string) => /^(\d)\1+$/.test(value);

  const validateCPF = (value: string) => {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || hasAllEqualDigits(cpf)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i += 1) sum += parseInt(cpf[i], 10) * (10 - i);
    let dv1 = (sum * 10) % 11;
    if (dv1 === 10) dv1 = 0;
    if (dv1 !== parseInt(cpf[9], 10)) return false;

    sum = 0;
    for (let i = 0; i < 10; i += 1) sum += parseInt(cpf[i], 10) * (11 - i);
    let dv2 = (sum * 10) % 11;
    if (dv2 === 10) dv2 = 0;
    return dv2 === parseInt(cpf[10], 10);
  };

  const validateCNPJ = (value: string) => {
    const cnpj = onlyDigits(value);
    if (cnpj.length !== 14 || hasAllEqualDigits(cnpj)) return false;

    const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let sum = 0;
    for (let i = 0; i < 12; i += 1) sum += parseInt(cnpj[i], 10) * weights1[i];
    let dv1 = sum % 11;
    dv1 = dv1 < 2 ? 0 : 11 - dv1;
    if (dv1 !== parseInt(cnpj[12], 10)) return false;

    sum = 0;
    for (let i = 0; i < 13; i += 1) sum += parseInt(cnpj[i], 10) * weights2[i];
    let dv2 = sum % 11;
    dv2 = dv2 < 2 ? 0 : 11 - dv2;
    return dv2 === parseInt(cnpj[13], 10);
  };

  const isDocumentValid = useMemo(() => {
    if (!profileType) return false;
    const digits = onlyDigits(formData.document);
    if (profileType === 'individual') return validateCPF(digits);
    if (profileType === 'company') return validateCNPJ(digits);
    return false;
  }, [formData.document, profileType]);

  const resetDocumentState = () => {
    setDocumentTouched(false);
    setFormData(prev => ({ ...prev, document: '' }));
    setErrors(prev => {
      const next = { ...prev };
      delete next.document;
      return next;
    });
  };

  const handleDocumentBlur = () => {
    setDocumentTouched(true);
    if (!isDocumentValid) {
      const documentLabel = getDocumentLabel();
      setErrors(prev => ({ ...prev, document: `${documentLabel} inválido` }));
      toast.error(`${documentLabel} inválido`);
      return;
    }

    setErrors(prev => {
      const next = { ...prev };
      delete next.document;
      return next;
    });
  };

  const isDocumentAvailable = async (documentDigits: string) => {
    const { data, error } = await supabase.rpc('is_document_available', {
      p_document: documentDigits,
    });

    if (error) {
      console.error('[Register] Erro ao validar duplicidade do documento:', error);
      return true;
    }

    return data !== false;
  };

  const fieldRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Ordem visual dos campos para focar o primeiro inválido.
  const FIELD_ORDER = [
    'name', 'document', 'phone', 'email', 'password', 'confirmPassword',
    'cep', 'logradouro', 'numero', 'bairro', 'cidade', 'estado',
  ] as const;

  const inputClass = (field: string, extra = '') =>
    `w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${extra} ${
      errors[field] ? 'border-red-300' : 'border-transparent focus:ring-2 focus:bg-white'
    }`;
  const inputStyle = (field: string) =>
    !errors[field] ? ({ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }) : undefined;

  const clearFieldError = (field: string) =>
    setErrors(prev => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });

  // Atualiza o valor e limpa apenas o erro do próprio campo (sem tocar nos demais).
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    clearFieldError(field);
  };

  // --- Regras de qualidade espelhadas da Edge create-asaas-checkout-session ---
  // Garante que uma conta criada corretamente não seja bloqueada depois no checkout.
  const normalizeCustomerName = (value: string) => value.trim().replace(/\s+/g, ' ');

  const validateNameValue = (value: string) => {
    const name = normalizeCustomerName(value);
    if (!name) return profileType === 'company' ? 'Informe a razão social' : 'Informe o nome completo';
    if (name.length < 3) {
      return profileType === 'company' ? 'Razão social deve ter ao menos 3 caracteres' : 'Nome muito curto';
    }
    if (profileType === 'individual' && name.split(/\s+/).filter(Boolean).length < 2) {
      return 'Informe nome e sobrenome';
    }
    return '';
  };

  const handleNameBlur = () => {
    const normalizedName = normalizeCustomerName(formData.name);
    const nameError = validateNameValue(normalizedName);

    setFormData(prev => ({ ...prev, name: normalizedName }));
    setErrors(prev => {
      const next = { ...prev };
      if (nameError) next.name = nameError;
      else delete next.name;
      return next;
    });
  };

  const validatePhoneValue = (value: string) => {
    const digits = onlyDigits(value);
    if (!digits) return 'Informe o telefone';
    if (!/^[1-9]{2}(?:9\d{8}|\d{8})$/.test(digits)) return 'Telefone inválido: use DDD + número (celular com 9)';
    if (/^(\d)\1+$/.test(digits.slice(2))) return 'Número de telefone inválido';
    return '';
  };

  const validateForm = () => {
    const next: Record<string, string> = {};

    const nameError = validateNameValue(formData.name);
    if (nameError) next.name = nameError;

    const documentDigits = onlyDigits(formData.document);
    const isDocValid =
      profileType === 'individual'
        ? validateCPF(documentDigits)
        : profileType === 'company'
          ? validateCNPJ(documentDigits)
          : false;
    if (!isDocValid) next.document = `${getDocumentLabel()} inválido`;

    const phoneError = validatePhoneValue(formData.phone);
    if (phoneError) next.phone = phoneError;

    if (!formData.email.trim()) next.email = 'Informe o e-mail';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = 'E-mail inválido';

    if (!formData.password) next.password = 'Informe a senha';
    else if (formData.password.length < 6) next.password = 'Mínimo 6 caracteres';

    if (!formData.confirmPassword) next.confirmPassword = 'Confirme a senha';
    else if (formData.password !== formData.confirmPassword) next.confirmPassword = 'As senhas não coincidem';

    if (onlyDigits(formData.cep).length !== 8) next.cep = 'CEP deve ter 8 dígitos';

    if (!formData.logradouro.trim()) next.logradouro = 'Informe o logradouro';
    if (!formData.numero.trim()) next.numero = 'Informe o número';
    if (!formData.bairro.trim()) next.bairro = 'Informe o bairro';
    if (!formData.cidade.trim()) next.cidade = 'Informe a cidade';

    if (!formData.estado.trim()) next.estado = 'Informe o estado';
    else if (!/^[A-Za-z]{2}$/.test(formData.estado.trim())) next.estado = 'UF deve ter 2 letras';

    return next;
  };

  const focusFirstError = (errs: Record<string, string>) => {
    const first = FIELD_ORDER.find((field) => errs[field]);
    if (!first) return;
    const el = fieldRefs.current[first];
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  useEffect(() => {
    if (user) {
      navigate(buildPostAuthRedirect('/minha-conta'), { replace: true });
    }
  }, [location.search, navigate, user]);

  useEffect(() => {
    if (!inviteCode || typeof window === 'undefined') {
      setInvitePreview(null);
      setInviteLookupFailed(false);
      return;
    }

    let cancelled = false;

    const syncInvite = async () => {
      setIsLoadingInvite(true);
      setInviteLookupFailed(false);

      try {
        const { data, error } = await supabase.rpc('resolve_public_invite_campaign', {
          p_code: inviteCode,
        });

        if (error) {
          throw error;
        }

        const resolved = Array.isArray(data) ? data[0] : null;

        if (!resolved) {
          if (!cancelled) {
            setInvitePreview(null);
            setInviteLookupFailed(true);
          }
          return;
        }

        const storageKey = buildInviteSessionStorageKey(inviteCode);
        const existingSessionId = window.localStorage.getItem(storageKey);
        const inviteSessionId = existingSessionId || createInviteSessionId();

        if (!existingSessionId) {
          window.localStorage.setItem(storageKey, inviteSessionId);
        }

        await supabase.rpc('register_invite_visit', {
          p_code: inviteCode,
          p_session_id: inviteSessionId,
          p_landing_path: '/cadastro',
        });

        if (!cancelled) {
          setInvitePreview(resolved as InviteCampaignPreview);
        }
      } catch (_error) {
        if (!cancelled) {
          setInvitePreview(null);
          setInviteLookupFailed(true);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInvite(false);
        }
      }
    };

    void syncInvite();

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const handleCepBlur = async () => {
    const cepClean = formData.cep.replace(/\D/g, '');
    if (cepClean.length !== 8) {
      setErrors(prev => ({ ...prev, cep: 'CEP deve ter 8 dígitos' }));
      return;
    }

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErrors(prev => ({ ...prev, cep: 'CEP não encontrado' }));
        setLoadingCep(false);
        return;
      }

      setFormData(prev => ({
        ...prev,
        logradouro: data.logradouro || '',
        bairro: data.bairro || '',
        cidade: data.localidade || '',
        estado: data.uf || ''
      }));
      setErrors(prev => {
        const next = { ...prev };
        delete next.cep;
        // Limpa erros dos campos que o ViaCEP preencheu (os vazios seguem exigidos no submit).
        if (data.logradouro) delete next.logradouro;
        if (data.bairro) delete next.bairro;
        if (data.localidade) delete next.cidade;
        if (data.uf) delete next.estado;
        return next;
      });
    } catch (_err) {
      setErrors(prev => ({ ...prev, cep: 'Erro ao consultar CEP' }));
    } finally {
      setLoadingCep(false);
    }
  };

  // Revalida ao vivo apenas e-mail/senha, mesclando no estado anterior para NÃO apagar
  // os erros já sinalizados nos demais campos quando o usuário corrige um só deles.
  useEffect(() => {
    if (!profileType) return;

    setErrors(prev => {
      const next = { ...prev };

      if (!formData.email) delete next.email;
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) next.email = 'E-mail inválido';
      else delete next.email;

      if (!formData.password) delete next.password;
      else if (formData.password.length < 6) next.password = 'Mínimo 6 caracteres';
      else delete next.password;

      if (!formData.confirmPassword) delete next.confirmPassword;
      else if (formData.password !== formData.confirmPassword) next.confirmPassword = 'As senhas não coincidem';
      else delete next.confirmPassword;

      return next;
    });
  }, [formData.email, formData.password, formData.confirmPassword, profileType]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validação completa controlada pelo React ANTES da duplicidade e do signUp.
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setDocumentTouched(true);
      focusFirstError(validationErrors);
      toast.error('Revise os campos destacados antes de continuar.');
      return;
    }

    if (!acceptedTerms) {
      toast.error('Aceite os Termos de Uso e a Política de Privacidade para continuar.');
      return;
    }

    const documentDigits = onlyDigits(formData.document);

    const documentAvailable = await isDocumentAvailable(documentDigits);
    if (!documentAvailable) {
      const documentLabel = getDocumentLabel();
      const message = `${documentLabel} já cadastrado em outra conta.`;
      setDocumentTouched(true);
      setErrors(prev => ({ ...prev, document: message }));
      focusFirstError({ document: message });
      toast.error(message);
      return;
    }

    setLoading(true);

    const inviteSessionId =
      inviteCode && typeof window !== 'undefined'
        ? window.localStorage.getItem(buildInviteSessionStorageKey(inviteCode)) || ''
        : '';

    const { error } = await signUp(
      formData.email,
      formData.password,
      normalizeCustomerName(formData.name),
      onlyDigits(formData.phone),
      {
        document: documentDigits,
        birthDate: formData.birthDate,
        website: formData.website,
        cep: formData.cep.replace(/\D/g, ''),
        logradouro: formData.logradouro,
        numero: formData.numero,
        complemento: formData.complemento,
        bairro: formData.bairro,
        cidade: formData.cidade,
        estado: formData.estado,
        inviteCode: invitePreview?.code || inviteCode || undefined,
        inviteSessionId: inviteSessionId || undefined,
        captchaToken,
        legalConsents: {
          acceptedTermsOfUse: acceptedTerms,
          acceptedPrivacyPolicy: acceptedTerms,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
        }
      }
    );

    // Token é single-use: limpa e gera novo desafio após cada tentativa.
    setCaptchaToken('');
    setCaptchaReset((c) => c + 1);

    if (error) {
      toast.error(
        error.message === 'User already registered'
          ? 'Este e-mail já está cadastrado'
          : 'Erro ao criar conta. Tente novamente.'
      );
      setLoading(false);
      return;
    }

    toast.success('Cadastro concluído!', {
      description: 'Sua conta foi criada com sucesso.'
    });
    setLoading(false);
    navigate(buildPostAuthRedirect('/anunciar'), { replace: true });
  };

  const getPasswordStrength = () => {
    if (!formData.password) return 0;

    let strength = 0;
    if (formData.password.length > 7) strength += 25;
    if (/[A-Z]/.test(formData.password)) strength += 25;
    if (/[0-9]/.test(formData.password)) strength += 25;
    if (/[^A-Za-z0-9]/.test(formData.password)) strength += 25;
    return strength;
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">
      <SeoHead
        title="Criar conta"
        description="Crie sua conta na AGRO BW para anunciar e negociar no agronegócio."
        canonicalPath="/cadastro"
        noIndex
      />
      <div className="hidden lg:block lg:w-[45%] sticky top-0 h-screen relative">
        <img
          src={registerHeroImage}
          alt="Inovação no campo"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, color-mix(in srgb, ${settings.secondaryColor} 86%, transparent), color-mix(in srgb, ${settings.primaryColor} 38%, transparent), transparent)`
          }}
        />
        <div className="relative z-10 p-20 flex flex-col justify-end h-full text-white">
          <div className="max-w-xl">
            <h2 className="text-5xl font-black mb-6 font-display leading-tight">
              Sua jornada no agro digital começa agora.
            </h2>
            <p className="text-xl font-medium leading-relaxed" style={{ color: 'rgba(255,255,255,0.82)' }}>
              Crie seu perfil em segundos e conecte-se com o maior ecossistema de negócios rurais do país.
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 w-full lg:w-[55%] flex items-center justify-center p-8 md:p-12 lg:p-20 bg-slate-50 md:bg-white">
        <div className="max-w-md w-full animate-in fade-in slide-in-from-right duration-500">
          <div className="mb-10 text-center md:text-left">
            <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt={settings.siteName} className="h-12 w-auto max-w-[220px] object-contain" />
              ) : (
                <>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                    style={{ backgroundColor: settings.primaryColor }}
                  >
                    <span className="text-white text-2xl font-black">
                      {(settings.siteShortName || settings.siteName || 'B').charAt(0)}
                    </span>
                  </div>
                  <span className="text-xl font-black text-slate-800">{settings.siteName}</span>
                </>
              )}
            </Link>

            {!profileType ? (
              <>
                <h1 className="text-3xl font-black text-slate-900 font-display">Como você quer atuar?</h1>
                <p className="text-slate-500 mt-2 font-medium">Selecione o tipo de conta para continuar.</p>
              </>
            ) : (
              <>
                <button
                  onClick={() => setProfileType(null)}
                  className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest mb-4 hover:underline"
                  style={{ color: settings.primaryColor }}
                >
                  <ChevronLeft className="w-3 h-3" strokeWidth={1.5} />
                  Trocar Tipo de Perfil
                </button>
                <h1 className="text-3xl font-black text-slate-900 font-display">
                  {profileType === 'individual' ? 'Perfil Produtor' : 'Perfil Empresa'}
                </h1>
                <p className="text-slate-500 mt-1 font-medium">Preencha os dados básicos da sua conta.</p>
              </>
            )}
          </div>

          {inviteCode ? (
            <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700">
                Convite de captação
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-800">
                {isLoadingInvite
                  ? 'Validando convite...'
                  : invitePreview
                    ? `Cadastro vinculado ao convite de ${invitePreview.captor_name}.`
                    : inviteLookupFailed
                      ? 'O link de convite não está mais ativo, mas você pode seguir com o cadastro.'
                      : 'Cadastro vinculado ao convite recebido.'}
              </p>
            </div>
          ) : null}

          {!profileType ? (
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => {
                  setProfileType('individual');
                  resetDocumentState();
                }}
                className="group p-5 bg-white border border-slate-100 rounded-xl text-left transition-all"
                style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 10%, #e2e8f0)` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${settings.primaryColor} 12%, white)`,
                    color: settings.primaryColor
                  }}
                >
                  <Sprout className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Sou Produtor</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                  Para pessoas físicas que desejam comprar ou vender animais e máquinas.
                </p>
              </button>

              <button
                onClick={() => {
                  setProfileType('company');
                  resetDocumentState();
                }}
                className="group p-5 bg-white border border-slate-100 rounded-xl text-left transition-all"
                style={{ borderColor: `color-mix(in srgb, ${settings.primaryColor} 10%, #e2e8f0)` }}
              >
                <div
                  className="w-10 h-10 text-white rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: settings.secondaryColor }}
                >
                  <Building2 className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Sou Empresa / Revenda</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">
                  Para imobiliárias, concessionárias e empresas de insumos com CNPJ.
                </p>
              </button>
            </div>
          ) : (
            <form onSubmit={handleRegister} noValidate className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  {profileType === 'individual' ? 'Nome completo (nome e sobrenome)' : 'Razão Social'} <span className="text-red-500">*</span>
                </label>
                <input
                  ref={el => { fieldRefs.current.name = el; }}
                  required
                  aria-required="true"
                  type="text"
                  value={formData.name}
                  onChange={e => handleFieldChange('name', e.target.value)}
                  onBlur={handleNameBlur}
                  autoComplete="name"
                  className={inputClass('name')}
                  style={inputStyle('name')}
                  placeholder={profileType === 'individual' ? 'Ex: João da Silva' : 'Ex: Agro Tech Ltda'}
                />
                {errors.name ? (
                  <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.name}</p>
                ) : profileType === 'individual' ? (
                  <p className="text-[10px] text-slate-500 mt-1 ml-1">Informe exatamente como aparece no CPF.</p>
                ) : null}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  {getDocumentLabel()} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={el => { fieldRefs.current.document = el; }}
                    required
                    aria-required="true"
                    type="text"
                    value={formData.document}
                    onChange={e => handleFieldChange('document', maskDocument(e.target.value))}
                    onBlur={handleDocumentBlur}
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium pr-12 ${
                      errors.document && documentTouched
                        ? 'border-red-300'
                        : 'border-transparent focus:ring-2 focus:bg-white'
                    }`}
                    style={
                      !(errors.document && documentTouched)
                        ? { ['--tw-ring-color' as any]: `${settings.primaryColor}33` }
                        : undefined
                    }
                    placeholder={profileType === 'individual' ? '000.000.000-00' : '00.000.000/0001-00'}
                    inputMode="numeric"
                    maxLength={profileType === 'individual' ? 14 : 18}
                  />
                  {documentTouched && errors.document && (
                    <AlertTriangle className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                  )}
                  {documentTouched && !errors.document && isDocumentValid && (
                    <CheckCircle2
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4"
                      style={{ color: settings.primaryColor }}
                    />
                  )}
                </div>
                {documentTouched && errors.document && (
                  <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.document}</p>
                )}
              </div>

              {profileType === 'individual' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Data de Nascimento
                  </label>
                  <input
                    type="date"
                    value={formData.birthDate}
                    onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                    style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Telefone <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={el => { fieldRefs.current.phone = el; }}
                    required
                    aria-required="true"
                    type="tel"
                    value={formData.phone}
                    onChange={e => handleFieldChange('phone', maskPhone(e.target.value))}
                    className={inputClass('phone')}
                    style={inputStyle('phone')}
                    placeholder="(00) 00000-0000"
                  />
                  {errors.phone && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.phone}</p>}
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    E-mail <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={el => { fieldRefs.current.email = el; }}
                    required
                    aria-required="true"
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className={inputClass('email')}
                    style={inputStyle('email')}
                    placeholder="email@agro.com"
                  />
                  {errors.email && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.email}</p>}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Site/URL (Opcional)
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                  style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                  placeholder="https://seu-site.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Senha de Acesso <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    ref={el => { fieldRefs.current.password = el; }}
                    required
                    aria-required="true"
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className={inputClass('password', 'pr-14')}
                    style={inputStyle('password')}
                    placeholder="Digite sua senha"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {formData.password && (
                  <div className="mt-2 flex gap-1 h-1 px-1">
                    {[25, 50, 75, 100].map(value => (
                      <div
                        key={value}
                        className={`flex-1 rounded-full transition-all duration-500 ${
                          getPasswordStrength() >= value ? '' : 'bg-slate-200'
                        }`}
                        style={
                          getPasswordStrength() >= value
                            ? {
                                backgroundColor:
                                  getPasswordStrength() > 50 ? settings.primaryColor : settings.accentColor
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}
                {errors.password && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.password}</p>}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Confirmar Senha <span className="text-red-500">*</span>
                </label>
                <input
                  ref={el => { fieldRefs.current.confirmPassword = el; }}
                  required
                  aria-required="true"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className={inputClass('confirmPassword')}
                  style={inputStyle('confirmPassword')}
                  placeholder="Confirme sua senha"
                />
                {errors.confirmPassword && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.confirmPassword}</p>}
              </div>

              <div className="pt-6 border-t border-slate-200">
                <h3 className="text-sm font-black text-slate-800 mb-5 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Endereço
                </h3>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    CEP <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      ref={el => { fieldRefs.current.cep = el; }}
                      required
                      aria-required="true"
                      type="text"
                      value={formData.cep}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '');
                        const masked = value.slice(0, 5) + (value.length > 5 ? `-${value.slice(5, 8)}` : '');
                        handleFieldChange('cep', masked);
                      }}
                      onBlur={handleCepBlur}
                      className={inputClass('cep')}
                      style={inputStyle('cep')}
                      placeholder="00000-000"
                    />
                    {loadingCep && (
                      <LoaderCircle className="absolute right-5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-400" />
                    )}
                  </div>
                  {errors.cep && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.cep}</p>}
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      Logradouro <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={el => { fieldRefs.current.logradouro = el; }}
                      required
                      aria-required="true"
                      type="text"
                      value={formData.logradouro}
                      onChange={e => handleFieldChange('logradouro', e.target.value)}
                      className={inputClass('logradouro')}
                      style={inputStyle('logradouro')}
                      placeholder="Rua, Avenida, etc"
                      readOnly={!!formData.logradouro && loadingCep}
                    />
                    {errors.logradouro && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.logradouro}</p>}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      Número <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={el => { fieldRefs.current.numero = el; }}
                      required
                      aria-required="true"
                      type="text"
                      value={formData.numero}
                      onChange={e => handleFieldChange('numero', e.target.value)}
                      className={inputClass('numero')}
                      style={inputStyle('numero')}
                      placeholder="000"
                    />
                    {errors.numero && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.numero}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 mt-3">
                    Complemento (Opcional)
                  </label>
                  <input
                    type="text"
                    value={formData.complemento}
                    onChange={e => setFormData({ ...formData, complemento: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                    style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                    placeholder="Apto 101, Bloco A, etc"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      Bairro <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={el => { fieldRefs.current.bairro = el; }}
                      required
                      aria-required="true"
                      type="text"
                      value={formData.bairro}
                      onChange={e => handleFieldChange('bairro', e.target.value)}
                      className={inputClass('bairro')}
                      style={inputStyle('bairro')}
                      placeholder="Bairro"
                      readOnly={!!formData.bairro && loadingCep}
                    />
                    {errors.bairro && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.bairro}</p>}
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      Cidade <span className="text-red-500">*</span>
                    </label>
                    <input
                      ref={el => { fieldRefs.current.cidade = el; }}
                      required
                      aria-required="true"
                      type="text"
                      value={formData.cidade}
                      onChange={e => handleFieldChange('cidade', e.target.value)}
                      className={inputClass('cidade')}
                      style={inputStyle('cidade')}
                      placeholder="Cidade"
                      readOnly={!!formData.cidade && loadingCep}
                    />
                    {errors.cidade && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.cidade}</p>}
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Estado (UF) <span className="text-red-500">*</span>
                  </label>
                  <input
                    ref={el => { fieldRefs.current.estado = el; }}
                    required
                    aria-required="true"
                    type="text"
                    value={formData.estado}
                    onChange={e => handleFieldChange('estado', e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                    className={inputClass('estado')}
                    style={inputStyle('estado')}
                    placeholder="SP"
                    readOnly={!!formData.estado && loadingCep}
                  />
                  {errors.estado && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.estado}</p>}
                </div>
              </div>

              <div className="flex items-start gap-3 py-2">
                <input
                  type="checkbox"
                  id="terms"
                  required
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="w-5 h-5 mt-0.5 rounded border-slate-200 transition-all cursor-pointer"
                  style={{ accentColor: settings.primaryColor }}
                />
                <label htmlFor="terms" className="text-xs font-bold text-slate-500 leading-relaxed cursor-pointer">
                  Li e aceito os{' '}
                  <Link to="/termos-de-uso" className="hover:underline" style={{ color: settings.primaryColor }}>
                    Termos de Uso
                  </Link>{' '}
                  e a{' '}
                  <Link to="/privacidade" className="hover:underline" style={{ color: settings.primaryColor }}>
                    Política de Privacidade
                  </Link>{' '}
                  da {settings.siteName}.
                </label>
              </div>

              <div className="pt-1">
                <CaptchaWidget
                  onVerify={setCaptchaToken}
                  onError={() => setCaptchaToken('')}
                  onExpire={() => setCaptchaToken('')}
                  resetSignal={captchaReset}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !acceptedTerms || !captchaToken || Object.keys(errors).length > 0}
                className="w-full text-white py-5 rounded-2xl font-black text-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 mt-4"
                style={{
                  backgroundColor: settings.primaryColor,
                  boxShadow: `0 20px 30px -18px ${settings.primaryColor}66`
                }}
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    Criando sua conta...
                  </>
                ) : (
                  'Finalizar Cadastro'
                )}
              </button>
            </form>
          )}

          <div className="mt-12 text-center">
            <p className="text-slate-500 font-medium">
              Já possui uma conta?{' '}
              <Link
                to={registerLoginLink}
                className="font-black hover:underline underline-offset-4 decoration-2"
                style={{ color: settings.primaryColor }}
              >
                Fazer Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterView;
