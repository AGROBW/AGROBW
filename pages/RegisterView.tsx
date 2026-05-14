import React, { useEffect, useMemo, useState } from 'react';
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

type ProfileType = 'individual' | 'company' | null;

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
  const registerLoginLink = `/login${location.search}`;

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

  useEffect(() => {
    if (user) {
      navigate(buildPostAuthRedirect('/minha-conta'), { replace: true });
    }
  }, [location.search, navigate, user]);

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
        return next;
      });
    } catch (_err) {
      setErrors(prev => ({ ...prev, cep: 'Erro ao consultar CEP' }));
    } finally {
      setLoadingCep(false);
    }
  };

  useEffect(() => {
    if (!profileType) return;

    setErrors(prev => {
      const next: Record<string, string> = {};

      if (prev.document) next.document = prev.document;
      if (prev.cep) next.cep = prev.cep;

      if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        next.email = 'E-mail inválido';
      }
      if (formData.password && formData.password.length < 6) {
        next.password = 'Mínimo 6 caracteres';
      }
      if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
        next.confirmPassword = 'As senhas não coincidem';
      }

      return next;
    });
  }, [formData, profileType]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    const documentDigits = onlyDigits(formData.document);
    const isDocValidNow =
      profileType === 'individual'
        ? validateCPF(documentDigits)
        : profileType === 'company'
          ? validateCNPJ(documentDigits)
          : false;

    if (!isDocValidNow) {
      setDocumentTouched(true);
      const documentLabel = getDocumentLabel();
      setErrors(prev => ({ ...prev, document: `${documentLabel} inválido` }));
      toast.error(`${documentLabel} inválido`);
      return;
    }

    const documentAvailable = await isDocumentAvailable(documentDigits);
    if (!documentAvailable) {
      const documentLabel = getDocumentLabel();
      const message = `${documentLabel} já cadastrado em outra conta.`;
      setDocumentTouched(true);
      setErrors(prev => ({ ...prev, document: message }));
      toast.error(message);
      return;
    }

    if (Object.keys(errors).length > 0 || !acceptedTerms) return;

    setLoading(true);

    const { error } = await signUp(formData.email, formData.password, formData.name, onlyDigits(formData.phone), {
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
      legalConsents: {
        acceptedTermsOfUse: acceptedTerms,
        acceptedPrivacyPolicy: acceptedTerms,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
      }
    });

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
          src="https://images.unsplash.com/photo-1595079676339-1534801ad6cf?q=80&w=1600&auto=format&fit=crop"
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
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shadow-md"
                style={{ backgroundColor: settings.primaryColor }}
              >
                <span className="text-white text-2xl font-black">T</span>
              </div>
              <span className="text-xl font-black text-slate-800">{settings.siteName}</span>
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
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  {profileType === 'individual' ? 'Nome Completo' : 'Razão Social'}
                </label>
                <input
                  required
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                  style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                  placeholder={profileType === 'individual' ? 'Ex: João da Silva' : 'Ex: Agro Tech Ltda'}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  {getDocumentLabel()}
                </label>
                <div className="relative">
                  <input
                    required
                    type="text"
                    value={formData.document}
                    onChange={e => setFormData({ ...formData, document: maskDocument(e.target.value) })}
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
                    Telefone
                  </label>
                  <input
                    required
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: maskPhone(e.target.value) })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                    style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                    placeholder="(00) 00000-0000"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    E-mail
                  </label>
                  <input
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${
                      errors.email ? 'border-red-200' : 'border-transparent focus:ring-2 focus:bg-white'
                    }`}
                    style={
                      !errors.email ? { ['--tw-ring-color' as any]: `${settings.primaryColor}33` } : undefined
                    }
                    placeholder="email@agro.com"
                  />
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
                  Senha de Acesso
                </label>
                <div className="relative">
                  <input
                    required
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium pr-14"
                    style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
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
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  Confirmar Senha
                </label>
                <input
                  required
                  type="password"
                  value={formData.confirmPassword}
                  onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${
                    errors.confirmPassword ? 'border-red-200' : 'border-transparent focus:ring-2 focus:bg-white'
                  }`}
                  style={
                    !errors.confirmPassword
                      ? { ['--tw-ring-color' as any]: `${settings.primaryColor}33` }
                      : undefined
                  }
                  placeholder="Confirme sua senha"
                />
              </div>

              <div className="pt-6 border-t border-slate-200">
                <h3 className="text-sm font-black text-slate-800 mb-5 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Endereço
                </h3>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    CEP
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={formData.cep}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '');
                        const masked = value.slice(0, 5) + (value.length > 5 ? `-${value.slice(5, 8)}` : '');
                        setFormData({ ...formData, cep: masked });
                      }}
                      onBlur={handleCepBlur}
                      className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${
                        errors.cep ? 'border-red-200' : 'border-transparent focus:ring-2 focus:bg-white'
                      }`}
                      style={!errors.cep ? { ['--tw-ring-color' as any]: `${settings.primaryColor}33` } : undefined}
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
                      Logradouro
                    </label>
                    <input
                      type="text"
                      value={formData.logradouro}
                      onChange={e => setFormData({ ...formData, logradouro: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                      placeholder="Rua, Avenida, etc"
                      readOnly={!!formData.logradouro && loadingCep}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      Número
                    </label>
                    <input
                      type="text"
                      value={formData.numero}
                      onChange={e => setFormData({ ...formData, numero: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                      placeholder="000"
                    />
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
                      Bairro
                    </label>
                    <input
                      type="text"
                      value={formData.bairro}
                      onChange={e => setFormData({ ...formData, bairro: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                      placeholder="Bairro"
                      readOnly={!!formData.bairro && loadingCep}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                      Cidade
                    </label>
                    <input
                      type="text"
                      value={formData.cidade}
                      onChange={e => setFormData({ ...formData, cidade: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                      placeholder="Cidade"
                      readOnly={!!formData.cidade && loadingCep}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                    Estado (UF)
                  </label>
                  <input
                    type="text"
                    value={formData.estado}
                    onChange={e => setFormData({ ...formData, estado: e.target.value.toUpperCase().slice(0, 2) })}
                    maxLength={2}
                    className="w-full bg-slate-50 border-2 border-transparent focus:ring-2 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                    style={{ ['--tw-ring-color' as any]: `${settings.primaryColor}33` }}
                    placeholder="SP"
                    readOnly={!!formData.estado && loadingCep}
                  />
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

              <button
                type="submit"
                disabled={loading || !acceptedTerms || Object.keys(errors).length > 0}
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
