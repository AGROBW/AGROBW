import React from 'react';
import { Info, X } from 'lucide-react';

interface NewsSocialHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const sections = [
  {
    title: 'LinkedIn',
    items: [
      ['Ativar integração do LinkedIn', 'Liga ou desliga a automação dessa plataforma.'],
      ['Tipo de perfil', 'Escolha se a publicação sairá em um perfil pessoal ou em uma página da empresa.'],
      ['Nome da página ou perfil', 'É um rótulo interno do admin para identificar rapidamente qual conta está conectada.'],
      ['URN do autor', 'Identificador oficial do autor no LinkedIn. Ex.: urn:li:person:... ou urn:li:organization:....'],
      ['Access Token do LinkedIn', 'Token OAuth da sua aplicação com permissão para publicar em nome do perfil ou da organização.'],
      ['Arte padrão do LinkedIn', 'Imagem fallback usada no post quando a notícia não tiver uma arte específica para a plataforma.'],
      ['Publicar post automaticamente', 'Quando ativo, toda notícia publicada no site também entra na fila de publicação do LinkedIn.'],
      ['Template do post', 'Texto base do post. Você pode usar {{title}}, {{summary}} e {{url}}.'],
    ],
  },
  {
    title: 'Instagram',
    items: [
      ['Ativar integração do Instagram', 'Liga ou desliga a automação do Instagram Business.'],
      ['@seuperfil', 'Nome de usuário apenas para identificação no admin.'],
      ['Instagram Business Account ID', 'ID da conta profissional do Instagram usada pela API da Meta.'],
      ['Access Token do Instagram', 'Token da integração da Meta/Instagram com permissão para criar e publicar story.'],
      ['Arte padrão do Instagram Story', 'Imagem vertical fallback usada quando a notícia não tiver uma arte própria para story.'],
      ['Publicar story automaticamente', 'Quando ativo, toda notícia publicada entra na fila de publicação do story.'],
      ['Template do story', 'Texto base da publicação. Você pode usar {{title}} e {{url}} como placeholders.'],
    ],
  },
  {
    title: 'Automação',
    items: [
      ['Base pública das notícias', 'URL base usada para montar o link final da notícia publicada, somando o slug automaticamente.'],
      ['Salvar integrações', 'Grava as credenciais, templates e artes padrão para que a fila social use as configurações atuais.'],
      ['Fila de publicações sociais', 'Mostra o histórico de tentativas, publicações bem-sucedidas, falhas e jobs desabilitados.'],
    ],
  },
];

const NewsSocialHelpModal: React.FC<NewsSocialHelpModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = React.useState<(typeof sections)[number]['title']>('LinkedIn');

  React.useEffect(() => {
    if (isOpen) {
      setActiveSection('LinkedIn');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentSection = sections.find((section) => section.title === activeSection) || sections[0];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Como preencher a aba Rede Social</h3>
              <p className="mt-1 text-sm text-slate-500">
                Guia rápido para configurar LinkedIn, Instagram e a automação de publicação das notícias.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            aria-label="Fechar ajuda"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(90vh-96px)] overflow-y-auto px-6 py-6">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[280px,1fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Temas</p>
              <div className="mt-4 space-y-2">
                {sections.map((section) => {
                  const isActive = section.title === currentSection.title;
                  return (
                    <button
                      key={section.title}
                      type="button"
                      onClick={() => setActiveSection(section.title)}
                      className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/15'
                          : 'bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <p className="text-sm font-semibold">{section.title}</p>
                      <p className={`mt-1 text-xs ${isActive ? 'text-white/75' : 'text-slate-500'}`}>
                        {section.items.length} orientações
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-black text-slate-900">{currentSection.title}</h4>
                  <p className="mt-1 text-sm text-slate-500">
                    Veja abaixo o que preencher e para que serve cada campo dessa seção.
                  </p>
                </div>
                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-500 shadow-sm">
                  {currentSection.items.length} campos
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
                {currentSection.items.map(([label, description]) => (
                  <div key={label} className="rounded-2xl bg-white p-5 shadow-sm shadow-slate-200/60">
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewsSocialHelpModal;
