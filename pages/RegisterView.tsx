import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle, Building2, CheckCircle2, ChevronLeft, Sprout } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../src/contexts/AuthContext';
import { toast } from 'sonner';

type ProfileType = 'individual' | 'company' | null;

const RegisterView: React.FC = () => {
  const navigate = useNavigate();
  const { signUp, user } = useAuth();
  const [profileType, setProfileType] = useState<ProfileType>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [documentTouched, setDocumentTouched] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    document: '', // CPF ou CNPJ
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
  const [loadingCep, setLoadingCep] = useState(false);

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

  const maskDocument = (value: string) => {
    const digits = onlyDigits(value);
    return digits.length > 11 ? maskCNPJ(digits) : maskCPF(digits);
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

  const hasAllEqualDigits = (value: string) => /^([0-9])\1+$/.test(value);

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
    const digits = onlyDigits(formData.document);
    if (digits.length === 11) return validateCPF(digits);
    if (digits.length === 14) return validateCNPJ(digits);
    return false;
  }, [formData.document]);

  const handleDocumentBlur = () => {
    setDocumentTouched(true);
    if (!isDocumentValid) {
      setErrors(prev => ({ ...prev, document: 'Documento inválido' }));
      toast.error('Documento inválido');
    } else {
      setErrors(prev => {
        const next = { ...prev };
        delete next.document;
        return next;
      });
    }
  };

  // Redirecionar se já estiver logado
  useEffect(() => {
    if (user) {
      navigate('/minha-conta', { replace: true });
    }
  }, [user, navigate]);

  // Função para consultar CEP no ViaCEP
  const handleCepBlur = async () => {
    const cepClean = formData.cep.replace(/\D/g, '');
    if (cepClean.length !== 8) {
      setErrors(prev => ({...prev, cep: 'CEP deve ter 8 dígitos'}));
      return;
    }

    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cepClean}/json/`);
      const data = await response.json();

      if (data.erro) {
        setErrors(prev => ({...prev, cep: 'CEP não encontrado'}));
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
        const newErrors = {...prev};
        delete newErrors.cep;
        return newErrors;
      });
    } catch (err) {
      setErrors(prev => ({...prev, cep: 'Erro ao consultar CEP'}));
    } finally {
      setLoadingCep(false);
    }
  };


  // Validação
  useEffect(() => {
    if (!profileType) return;
    const newErrors: Record<string, string> = {};
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'E-mail inválido';
    }
    if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres';
    }
    if (formData.confirmPassword && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'As senhas não coincidem';
    }
    setErrors(newErrors);
  }, [formData, profileType]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const documentDigits = onlyDigits(formData.document);
    const isDocValidNow = documentDigits.length === 11 ? validateCPF(documentDigits) : documentDigits.length === 14 ? validateCNPJ(documentDigits) : false;
    if (!isDocValidNow) {
      setDocumentTouched(true);
      setErrors(prev => ({ ...prev, document: 'Documento inválido' }));
      toast.error('Documento inválido');
      return;
    }
    if (Object.keys(errors).length > 0 || !acceptedTerms) return;

    setLoading(true);

    const { error } = await signUp(
      formData.email,
      formData.password,
      formData.name,
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
        estado: formData.estado
      }
    );

    if (error) {
      toast.error(
        error.message === 'User already registered'
          ? 'Este e-mail já está cadastrado'
          : 'Erro ao criar conta. Tente novamente.'
      );
      setLoading(false);
    } else {
      // Cadastro bem-sucedido
      toast.success('Cadastro concluído!', { description: 'Sua conta foi criada com sucesso.' });
      setLoading(false);
      navigate('/anunciar', { replace: true });
    }
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
      {/* Lado Esquerdo: Imagem */}
      <div className="hidden lg:block lg:w-[45%] sticky top-0 h-screen relative">
        <img 
          src="https://images.unsplash.com/photo-1595079676339-1534801ad6cf?q=80&w=1600&auto=format&fit=crop" 
          alt="Inovação no Campo" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-green-950/80 via-green-800/40 to-transparent"></div>
        <div className="relative z-10 p-20 flex flex-col justify-end h-full text-white">
          <div className="max-w-xl">
            <h2 className="text-5xl font-black mb-6 font-display leading-tight">
              Sua jornada no agro digital começa agora.
            </h2>
            <p className="text-xl text-green-50/80 font-medium leading-relaxed">
              Crie seu perfil em segundos e conecte-se com o maior ecossistema de negócios rurais do país.
            </p>
          </div>
        </div>
      </div>

      {/* Lado Direito: Formulário */}
      <div className="flex-1 w-full lg:w-[55%] flex items-center justify-center p-8 md:p-12 lg:p-20 bg-slate-50 md:bg-white">
        <div className="max-w-md w-full animate-in fade-in slide-in-from-right duration-500">
          
          <div className="mb-10 text-center md:text-left">
            <Link to="/" className="inline-flex items-center gap-2 mb-8 group">
              <div className="w-10 h-10 bg-green-700 rounded-xl flex items-center justify-center shadow-md">
                <span className="text-white text-2xl font-black">T</span>
              </div>
              <span className="text-xl font-black text-slate-800">BWAGRO</span>
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
                  className="flex items-center gap-1 text-[10px] font-semibold text-green-700 uppercase tracking-widest mb-4 hover:underline"
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
            /* Seleção de Perfil */
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => setProfileType('individual')}
                className="group p-5 bg-white border border-slate-100 rounded-xl text-left hover:border-green-600 transition-all"
              >
                <div className="w-10 h-10 bg-green-50 text-green-600 rounded-lg flex items-center justify-center mb-4">
                  <Sprout className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Sou Produtor</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">Para pessoas físicas que desejam comprar ou vender animais e máquinas.</p>
              </button>
              <button 
                onClick={() => setProfileType('company')}
                className="group p-5 bg-white border border-slate-100 rounded-xl text-left hover:border-green-600 transition-all"
              >
                <div className="w-10 h-10 bg-slate-900 text-white rounded-lg flex items-center justify-center mb-4">
                  <Building2 className="w-5 h-5" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-slate-800 mb-2">Sou Empresa / Revenda</h3>
                <p className="text-slate-500 text-sm leading-relaxed font-medium">Para imobiliárias, concessionárias e empresas de insumos com CNPJ.</p>
              </button>
            </div>
          ) : (
            /* Formulário de Registro */
            <form onSubmit={handleRegister} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  {profileType === 'individual' ? 'Nome Completo' : 'Razão Social'}
                </label>
                <input 
                  required
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                  placeholder={profileType === 'individual' ? 'Ex: João da Silva' : 'Ex: Agro Tech Ltda'}
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                  {profileType === 'individual' ? 'CPF' : 'CNPJ'}
                </label>
                <div className="relative">
                  <input 
                    required
                    type="text"
                    value={formData.document}
                    onChange={e => setFormData({...formData, document: maskDocument(e.target.value)})}
                    onBlur={handleDocumentBlur}
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium pr-12 ${errors.document && documentTouched ? 'border-red-300' : 'border-transparent focus:border-green-600 focus:bg-white'}`}
                    placeholder={profileType === 'individual' ? '000.000.000-00' : '00.000.000/0001-00'}
                  />
                  {documentTouched && errors.document && (
                    <AlertTriangle className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />
                  )}
                  {documentTouched && !errors.document && isDocumentValid && (
                    <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                  )}
                </div>
                {documentTouched && errors.document && (
                  <p className="text-[10px] text-red-600 mt-1 ml-1">Documento inválido</p>
                )}
              </div>

              {profileType === 'individual' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Data de Nascimento</label>
                  <input 
                    type="date"
                    value={formData.birthDate}
                    onChange={e => setFormData({...formData, birthDate: e.target.value})}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Telefone</label>
                  <input 
                    required
                    type="tel"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: maskPhone(e.target.value)})}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">E-mail</label>
                  <input 
                    required
                    type="email"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${errors.email ? 'border-red-200' : 'border-transparent focus:border-green-600 focus:bg-white'}`}
                    placeholder="email@agro.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Site/URL (Opcional)</label>
                <input 
                  type="url"
                  value={formData.website}
                  onChange={e => setFormData({...formData, website: e.target.value})}
                  className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                  placeholder="https://seu-site.com"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Senha de Acesso</label>
                <div className="relative">
                  <input 
                    required
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium pr-14"
                    placeholder="••••••••"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
                {/* Strength Meter */}
                {formData.password && (
                  <div className="mt-2 flex gap-1 h-1 px-1">
                    {[25, 50, 75, 100].map(s => (
                      <div 
                        key={s} 
                        className={`flex-1 rounded-full transition-all duration-500 ${getPasswordStrength() >= s ? (getPasswordStrength() > 50 ? 'bg-green-500' : 'bg-yellow-500') : 'bg-slate-200'}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Confirmar Senha</label>
                <input 
                  required
                  type="password"
                  value={formData.confirmPassword}
                  onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                  className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${errors.confirmPassword ? 'border-red-200' : 'border-transparent focus:border-green-600 focus:bg-white'}`}
                  placeholder="••••••••"
                />
              </div>

              {/* Seção Endereço */}
              <div className="pt-6 border-t border-slate-200">
                <h3 className="text-sm font-black text-slate-800 mb-5 flex items-center gap-2">
                  📍 Endereço
                </h3>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">CEP</label>
                  <div className="relative">
                    <input 
                      type="text"
                      value={formData.cep}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '');
                        const masked = value.slice(0, 5) + (value.length > 5 ? '-' + value.slice(5, 8) : '');
                        setFormData({...formData, cep: masked});
                      }}
                      onBlur={handleCepBlur}
                      className={`w-full bg-slate-50 border-2 rounded-2xl px-5 py-4 outline-none transition-all font-medium ${errors.cep ? 'border-red-200' : 'border-transparent focus:border-green-600 focus:bg-white'}`}
                      placeholder="00000-000"
                    />
                    {loadingCep && (
                      <div className="absolute right-5 top-1/2 -translate-y-1/2 animate-spin">
                        ⏳
                      </div>
                    )}
                  </div>
                  {errors.cep && <p className="text-[10px] text-red-600 mt-1 ml-1">{errors.cep}</p>}
                </div>

                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Logradouro</label>
                    <input 
                      type="text"
                      value={formData.logradouro}
                      onChange={e => setFormData({...formData, logradouro: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      placeholder="Rua, Avenida, etc"
                      readOnly={!!formData.logradouro && loadingCep}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Número</label>
                    <input 
                      type="text"
                      value={formData.numero}
                      onChange={e => setFormData({...formData, numero: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      placeholder="000"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 mt-3">Complemento (Opcional)</label>
                  <input 
                    type="text"
                    value={formData.complemento}
                    onChange={e => setFormData({...formData, complemento: e.target.value})}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                    placeholder="Apto 101, Bloco A, etc"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Bairro</label>
                    <input 
                      type="text"
                      value={formData.bairro}
                      onChange={e => setFormData({...formData, bairro: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      placeholder="Bairro"
                      readOnly={!!formData.bairro && loadingCep}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Cidade</label>
                    <input 
                      type="text"
                      value={formData.cidade}
                      onChange={e => setFormData({...formData, cidade: e.target.value})}
                      className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
                      placeholder="Cidade"
                      readOnly={!!formData.cidade && loadingCep}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Estado (UF)</label>
                  <input 
                    type="text"
                    value={formData.estado}
                    onChange={e => setFormData({...formData, estado: e.target.value.toUpperCase().slice(0, 2)})}
                    maxLength={2}
                    className="w-full bg-slate-50 border-2 border-transparent focus:border-green-600 focus:bg-white rounded-2xl px-5 py-4 outline-none transition-all font-medium"
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
                  className="w-5 h-5 mt-0.5 rounded border-slate-200 text-green-600 focus:ring-green-500 transition-all cursor-pointer"
                />
                <label htmlFor="terms" className="text-xs font-bold text-slate-500 leading-relaxed cursor-pointer">
                  Li e aceito os <Link to="/termos-de-uso" className="text-green-700 hover:underline">Termos de Uso</Link> e a <Link to="/privacidade" className="text-green-700 hover:underline">Política de Privacidade</Link> do BWAGRO.
                </label>
              </div>

              <button 
                type="submit"
                disabled={loading || !acceptedTerms || Object.keys(errors).length > 0}
                className="w-full bg-green-700 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-green-200 hover:bg-green-800 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 mt-4"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    Criando sua conta...
                  </>
                ) : 'Finalizar Cadastro'}
              </button>
            </form>
          )}

          <div className="mt-12 text-center">
            <p className="text-slate-500 font-medium">
              Já possui uma conta?{' '}
              <Link to="/login" className="text-green-700 font-black hover:underline underline-offset-4 decoration-2">Fazer Login</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterView;